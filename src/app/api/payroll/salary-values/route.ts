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
  "phu_cap",
  "thuong",
  "phat",
  "kpi_chuyen_can",
  "kpi_trach_nhiem",
  "tien_phu_cap",  // legacy alias
  "tien_phat",     // legacy alias
])

const SaveManualInputSchema = z.object({
  payrollId: z.string().min(1),
  columnKey: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng: YYYY-MM"),
  value: z.number().int().min(0),
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

  // Verify payroll belongs to company and is DRAFT
  const payroll = await db.payroll.findFirst({ where: { id: payrollId, companyId } })
  if (!payroll) return NextResponse.json({ error: "Không tìm thấy bản lương" }, { status: 404 })
  if (payroll.status !== "DRAFT")
    return NextResponse.json({ error: "Chỉ sửa được bản lương DRAFT" }, { status: 400 })

  const [y, m] = month.split("-").map(Number)
  const monthDate = new Date(Date.UTC(y, m - 1, 1))

  await db.salaryValue.upsert({
    where: {
      employeeId_month_columnKey: {
        employeeId: payroll.employeeId,
        month: monthDate,
        columnKey,
      },
    },
    update: { value },
    create: {
      companyId,
      employeeId: payroll.employeeId,
      month: monthDate,
      columnKey,
      value,
    },
  })

    // Mark payroll as needing recalc (Phase 03b)
    await db.payroll.update({
      where: { id: payrollId },
      data: { needsRecalc: true },
    })

    // Recalculate payroll with new input
    try {
      const updated = await upsertPayroll(companyId, payroll.employeeId, month)
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
