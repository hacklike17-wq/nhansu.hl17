import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, requirePermission, errorResponse } from "@/lib/permission"
import {
  CreateSalaryValueEntrySchema,
  ENTRY_ALLOWED_COLUMNS,
} from "@/lib/schemas/payroll"
import { upsertPayroll } from "@/lib/services/payroll.service"

/**
 * Line-item breakdown for manual salary columns.
 *
 * Only `tien_phu_cap` + `tien_tru_khac` are opt-in for this feature
 * right now (ENTRY_ALLOWED_COLUMNS). Other salary columns keep the
 * single-value edit path via `/api/payroll/salary-values`.
 *
 * Writes are gated by `luong.edit`; reads are session-only so the
 * employee can see the breakdown for their own row. Employees cannot
 * request another employee's payroll by id — the route verifies
 * `payroll.employeeId === ctx.employeeId` when role is "employee".
 *
 * The API guarantees SalaryValue.value stays in sync with SUM(entries.amount)
 * by recomputing inside a transaction on every create / delete. Callers
 * should NOT mix this endpoint with the old single-value endpoint for the
 * same (employee, month, columnKey) — entries always win.
 */

type EntryOut = {
  id: string
  amount: number
  reason: string
  occurredAt: string | null
  createdBy: string | null
  createdAt: string
}

type ColumnBreakdown = {
  columnKey: string
  total: number
  entries: EntryOut[]
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function loadBreakdown(
  companyId: string,
  employeeId: string,
  month: Date
): Promise<ColumnBreakdown[]> {
  const values = await db.salaryValue.findMany({
    where: {
      companyId,
      employeeId,
      month,
      columnKey: { in: [...ENTRY_ALLOWED_COLUMNS] },
    },
    include: {
      entries: { orderBy: { createdAt: "asc" } },
    },
  })

  // Ensure every allowed column shows up in the response (even if it has
  // no SalaryValue row yet) so the UI can render an empty-list form.
  const byKey = new Map<string, ColumnBreakdown>()
  for (const col of ENTRY_ALLOWED_COLUMNS) {
    byKey.set(col, { columnKey: col, total: 0, entries: [] })
  }

  for (const v of values) {
    byKey.set(v.columnKey, {
      columnKey: v.columnKey,
      total: toNum(v.value),
      entries: v.entries.map(e => ({
        id: e.id,
        amount: toNum(e.amount),
        reason: e.reason,
        occurredAt: e.occurredAt ? e.occurredAt.toISOString().slice(0, 10) : null,
        createdBy: e.createdBy,
        createdAt: e.createdAt.toISOString(),
      })),
    })
  }

  return Array.from(byKey.values())
}

async function recomputeAndSyncValue(
  tx: any,
  salaryValueId: string
): Promise<number> {
  const remaining = await tx.salaryValueEntry.findMany({
    where: { salaryValueId },
    select: { amount: true },
  })
  const sum = remaining.reduce((s: number, r: any) => s + toNum(r.amount), 0)
  await tx.salaryValue.update({
    where: { id: salaryValueId },
    data: { value: sum },
  })
  return sum
}

/**
 * GET /api/payroll/salary-values/entries?payrollId=X
 * Returns an array of breakdown objects — one per ENTRY_ALLOWED_COLUMNS
 * column, with total + entries[]. Empty list if no entries exist yet.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession()
    const companyId = ctx.companyId
    if (!companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const payrollId = searchParams.get("payrollId")
    if (!payrollId) {
      return NextResponse.json({ error: "Thiếu payrollId" }, { status: 400 })
    }

    const payroll = await db.payroll.findFirst({
      where: { id: payrollId, companyId },
      select: { id: true, employeeId: true, month: true },
    })
    if (!payroll) return NextResponse.json({ error: "Không tìm thấy bản lương" }, { status: 404 })

    // Employees can only read breakdown for their own payroll row
    if (ctx.role === "employee" && ctx.employeeId !== payroll.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const breakdowns = await loadBreakdown(companyId, payroll.employeeId, payroll.month)
    return NextResponse.json({ payrollId, breakdowns })
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * POST /api/payroll/salary-values/entries
 * Body: { payrollId, columnKey, amount, reason, occurredAt? }
 * Adds one line item, re-syncs SalaryValue.value = sum(entries) inside a
 * transaction, then triggers upsertPayroll to recalc the DRAFT row.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("luong.edit")
    const companyId = ctx.companyId!

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Request body không hợp lệ" }, { status: 400 })
    }

    const parsed = CreateSalaryValueEntrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { payrollId, columnKey, amount, reason, occurredAt } = parsed.data

    const payroll = await db.payroll.findFirst({
      where: { id: payrollId, companyId },
      select: { id: true, employeeId: true, month: true, status: true },
    })
    if (!payroll) return NextResponse.json({ error: "Không tìm thấy bản lương" }, { status: 404 })
    if (payroll.status !== "DRAFT") {
      return NextResponse.json({ error: "Chỉ sửa được bản lương DRAFT" }, { status: 400 })
    }

    const occurredAtDate = occurredAt ? new Date(occurredAt + "T00:00:00Z") : null

    const { salaryValueId } = await db.$transaction(async tx => {
      // Upsert the parent SalaryValue — value gets rewritten below.
      const parent = await tx.salaryValue.upsert({
        where: {
          employeeId_month_columnKey: {
            employeeId: payroll.employeeId,
            month: payroll.month,
            columnKey,
          },
        },
        create: {
          companyId,
          employeeId: payroll.employeeId,
          month: payroll.month,
          columnKey,
          value: 0,
        },
        update: {},
      })

      await tx.salaryValueEntry.create({
        data: {
          salaryValueId: parent.id,
          amount,
          reason,
          occurredAt: occurredAtDate,
          createdBy: ctx.userId,
        },
      })

      await recomputeAndSyncValue(tx, parent.id)

      // Flag the payroll for recalc — upsertPayroll below will pick it up
      // and actually run the recompute.
      await tx.payroll.update({
        where: { id: payroll.id },
        data: { needsRecalc: true },
      })

      return { salaryValueId: parent.id }
    })

    // Recalc after the transaction so upsertPayroll sees committed data.
    // Fire-and-forget: a recalc failure shouldn't reject the entry write.
    const monthStr = `${payroll.month.getUTCFullYear()}-${String(
      payroll.month.getUTCMonth() + 1
    ).padStart(2, "0")}`
    upsertPayroll(companyId, payroll.employeeId, monthStr).catch(err =>
      console.warn("upsertPayroll after salary entry create failed:", err)
    )

    const breakdowns = await loadBreakdown(companyId, payroll.employeeId, payroll.month)
    return NextResponse.json({ ok: true, salaryValueId, breakdowns })
  } catch (e) {
    return errorResponse(e)
  }
}
