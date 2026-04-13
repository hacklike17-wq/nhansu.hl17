import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const action: "APPROVED" | "REJECTED" | "CANCELLED" = body.action

  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(action))
    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })

  const leaveRequest = await db.leaveRequest.findUnique({ where: { id } })
  if (!leaveRequest) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })
  if (leaveRequest.status !== "PENDING")
    return NextResponse.json({ error: "Đã xử lý" }, { status: 409 })

  const companyId = leaveRequest.companyId

  if (action === "APPROVED") {
    // Tạo DeductionEvents — 1 record/ngày trong transaction
    await db.$transaction(async (tx: any) => {
      // Concurrency guard: double-approve prevention
      const current = await tx.leaveRequest.findUnique({
        where: { id },
        select: { status: true },
      })
      if (current?.status !== "PENDING") throw new Error("Đã xử lý")

      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedBy: session.user.id,
          approvedAt: new Date(),
        },
      })

      // Tạo 1 DeductionEvent mỗi ngày nghỉ
      const start = new Date(leaveRequest.startDate)
      const end = new Date(leaveRequest.endDate)
      const events = []
      const cursor = new Date(start)
      while (cursor <= end) {
        const dow = cursor.getUTCDay()
        // Bỏ qua thứ 7 (6) và CN (0) — chỉ ngày làm việc
        if (dow !== 0 && dow !== 6) {
          events.push({
            companyId,
            employeeId: leaveRequest.employeeId,
            leaveRequestId: id,
            date: new Date(cursor),
            type: "NGHI_NGAY" as const,
            delta: -1,
            reason: `Nghỉ phép — đơn ${id.slice(0, 8)}`,
            status: "APPROVED" as const,
            approvedBy: session.user.id,
            approvedAt: new Date(),
          })
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }

      if (events.length > 0) {
        await tx.deductionEvent.createMany({ data: events })
      }

      await tx.auditLog.create({
        data: {
          companyId,
          entityType: "LeaveRequest",
          entityId: id,
          action: "APPROVED",
          changedBy: session.user.id,
          changes: { totalDays: events.length, type: leaveRequest.type },
        },
      })
    })
  } else {
    // REJECTED or CANCELLED
    await db.$transaction(async (tx: any) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: action,
          approvedBy: session.user.id,
          approvedAt: new Date(),
        },
      })
      // Xóa DeductionEvents liên quan (nếu có từ lần approve trước)
      await tx.deductionEvent.deleteMany({ where: { leaveRequestId: id } })
    })
  }

  const updated = await db.leaveRequest.findUnique({ where: { id } })
  return NextResponse.json(updated)
}
