import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { autoRecalcDraftPayroll } from "@/lib/services/payroll.service"
import { requirePermission, errorResponse } from "@/lib/permission"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("chamcong.edit")
    const { id } = await params
    const body = await req.json()
    const action: "APPROVED" | "REJECTED" = body.action

    if (!["APPROVED", "REJECTED"].includes(action))
      return NextResponse.json({ error: "action phải là APPROVED hoặc REJECTED" }, { status: 400 })

    const deduction = await db.deductionEvent.findFirst({
      where: { id, companyId: ctx.companyId ?? undefined },
    })
    if (!deduction) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })
    if (deduction.status !== "PENDING")
      return NextResponse.json({ error: "Đã xử lý" }, { status: 409 })

    const updated = await db.deductionEvent.update({
      where: { id },
      data: {
        status: action,
        approvedBy: ctx.userId,
        approvedAt: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        companyId: deduction.companyId,
        entityType: "DeductionEvent",
        entityId: id,
        action,
        changedBy: ctx.userId,
        changes: { previousStatus: "PENDING", newStatus: action },
      },
    })

    if (action === "APPROVED") {
      autoRecalcDraftPayroll(deduction.companyId, deduction.employeeId, deduction.date).catch(err =>
        console.warn("autoRecalcDraftPayroll after deduction approve failed:", err)
      )
    }

    return NextResponse.json(updated)
  } catch (e) {
    return errorResponse(e)
  }
}
