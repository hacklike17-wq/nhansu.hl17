import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { autoRecalcDraftPayroll } from "@/lib/services/payroll.service"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const action: "APPROVED" | "REJECTED" = body.action

  if (!["APPROVED", "REJECTED"].includes(action))
    return NextResponse.json({ error: "action phải là APPROVED hoặc REJECTED" }, { status: 400 })

  const deduction = await db.deductionEvent.findUnique({ where: { id } })
  if (!deduction) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })
  if (deduction.status !== "PENDING")
    return NextResponse.json({ error: "Đã xử lý" }, { status: 409 })

  const updated = await db.deductionEvent.update({
    where: { id },
    data: {
      status: action,
      approvedBy: session.user.id,
      approvedAt: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      companyId: deduction.companyId,
      entityType: "DeductionEvent",
      entityId: id,
      action,
      changedBy: session.user.id,
      changes: { previousStatus: "PENDING", newStatus: action },
    },
  })

  // Phase 03: auto-recalc DRAFT payroll after DeductionEvent approved
  if (action === "APPROVED") {
    autoRecalcDraftPayroll(deduction.companyId, deduction.employeeId, deduction.date).catch(err =>
      console.warn("autoRecalcDraftPayroll after deduction approve failed:", err)
    )
  }

  return NextResponse.json(updated)
}
