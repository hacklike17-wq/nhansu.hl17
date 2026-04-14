import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"
import { upsertPayroll } from "@/lib/services/payroll.service"

/**
 * DELETE /api/payroll/salary-values/entries/[id]
 *
 * Removes one line item, re-syncs SalaryValue.value = sum(remaining),
 * and triggers a DRAFT recalc. Verifies the parent SalaryValue belongs
 * to the caller's company and that its payroll is still DRAFT before
 * allowing the delete (chamcong-guard equivalent for salary entries).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("luong.edit")
    const companyId = ctx.companyId!
    const { id } = await params

    const entry = await db.salaryValueEntry.findUnique({
      where: { id },
      include: {
        salaryValue: {
          select: { id: true, companyId: true, employeeId: true, month: true, columnKey: true },
        },
      },
    })
    if (!entry) return NextResponse.json({ error: "Không tìm thấy entry" }, { status: 404 })
    if (entry.salaryValue.companyId !== companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Verify the associated payroll is still DRAFT — mirror the guard on
    // single-value writes in /api/payroll/salary-values.
    const payroll = await db.payroll.findUnique({
      where: {
        employeeId_month: {
          employeeId: entry.salaryValue.employeeId,
          month: entry.salaryValue.month,
        },
      },
      select: { id: true, status: true },
    })
    if (payroll && payroll.status !== "DRAFT") {
      return NextResponse.json(
        { error: `Không thể xoá — bảng lương đang ở trạng thái ${payroll.status}` },
        { status: 409 }
      )
    }

    const salaryValueId = entry.salaryValue.id

    await db.$transaction(async tx => {
      await tx.salaryValueEntry.delete({ where: { id } })

      const remaining = await tx.salaryValueEntry.findMany({
        where: { salaryValueId },
        select: { amount: true },
      })
      const sum = remaining.reduce((s, r) => s + Number(r.amount), 0)

      await tx.salaryValue.update({
        where: { id: salaryValueId },
        data: { value: sum },
      })

      if (payroll) {
        await tx.payroll.update({
          where: { id: payroll.id },
          data: { needsRecalc: true },
        })
      }
    })

    // Trigger recalc outside the transaction — fire-and-forget.
    const monthStr = `${entry.salaryValue.month.getUTCFullYear()}-${String(
      entry.salaryValue.month.getUTCMonth() + 1
    ).padStart(2, "0")}`
    upsertPayroll(companyId, entry.salaryValue.employeeId, monthStr).catch(err =>
      console.warn("upsertPayroll after salary entry delete failed:", err)
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
