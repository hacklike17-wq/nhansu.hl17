import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { upsertPayroll } from "@/lib/services/payroll.service"
import { requirePermission, errorResponse } from "@/lib/permission"

/**
 * Legacy canonical keys that are always allowed for manual input,
 * regardless of DB column config (backward compat for MANUAL_INPUT_MAP aliases).
 */
const LEGACY_CANONICAL_KEYS = new Set([
  "thuong",
])

const SaveManualInputSchema = z.object({
  payrollId: z.string().min(1),
  columnKey: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng: YYYY-MM"),
  // Cap at 1 billion VND — protects against typo-induced integer blowouts
  // that would ripple through gross/net calculations silently.
  value: z.number().int().min(0).max(1_000_000_000),
})

/**
 * POST /api/payroll/salary-values
 * Phase 05: Save a manual input SalaryValue and trigger payroll recalculation.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("luong.edit")
    const companyId = ctx.companyId!
    const body = await req.json()

    const parsed = SaveManualInputSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { payrollId, columnKey, month, value } = parsed.data

  // Allow legacy canonical keys OR any company column that is type=number and isEditable=true
  const isAllowed =
    LEGACY_CANONICAL_KEYS.has(columnKey) ||
    !!(await db.salaryColumn.findFirst({
      where: { companyId, key: columnKey, type: "number", isEditable: true },
    }))

  if (!isAllowed)
    return NextResponse.json({ error: `Cột '${columnKey}' không cho phép nhập tay` }, { status: 400 })

  const [y, m] = month.split("-").map(Number)
  if (!(m >= 1 && m <= 12)) {
    return NextResponse.json({ error: "Tháng không hợp lệ" }, { status: 400 })
  }
  const monthDate = new Date(Date.UTC(y, m - 1, 1))

  // Re-check payroll status INSIDE a transaction together with the upsert +
  // needsRecalc flag so a concurrent LOCK/APPROVE can't slip between the
  // status check and the write. upsertPayroll runs outside the tx because
  // it's idempotent — the atomic guard is the status re-read here.
  let payrollEmployeeId: string
  try {
    payrollEmployeeId = await db.$transaction(async tx => {
      const p = await tx.payroll.findFirst({ where: { id: payrollId, companyId } })
      if (!p) throw Object.assign(new Error("Không tìm thấy bản lương"), { status: 404 })
      if (p.status !== "DRAFT") {
        throw Object.assign(new Error("Chỉ sửa được bản lương DRAFT"), { status: 400 })
      }

      await tx.salaryValue.upsert({
        where: {
          employeeId_month_columnKey: {
            employeeId: p.employeeId,
            month: monthDate,
            columnKey,
          },
        },
        update: { value },
        create: {
          companyId,
          employeeId: p.employeeId,
          month: monthDate,
          columnKey,
          value,
        },
      })

      await tx.payroll.update({
        where: { id: payrollId },
        data: { needsRecalc: true },
      })

      return p.employeeId
    })
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500
    return NextResponse.json({ error: err?.message ?? "Lỗi lưu giá trị" }, { status })
  }

    // Recalculate payroll with new input (idempotent — safe outside the tx).
    try {
      const updated = await upsertPayroll(companyId, payrollEmployeeId, month)
      return NextResponse.json({ ok: true, payroll: updated })
    } catch (err: any) {
      console.error("upsertPayroll after salary-value save failed:", err?.message ?? err)
      return NextResponse.json(
        { error: `Đã lưu giá trị nhưng tính lại lương thất bại: ${err?.message ?? "lỗi không xác định"}` },
        { status: 500 }
      )
    }
  } catch (e) {
    return errorResponse(e)
  }
}
