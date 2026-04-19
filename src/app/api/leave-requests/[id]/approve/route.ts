import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("nghiphep.edit")
    const { id } = await params
    const body = await req.json()
    const action: "APPROVED" | "REJECTED" | "CANCELLED" = body.action

    if (!["APPROVED", "REJECTED", "CANCELLED"].includes(action))
      return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })

    const leaveRequest = await db.leaveRequest.findFirst({
      where: { id, companyId: ctx.companyId ?? undefined },
    })
    if (!leaveRequest) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })
    if (leaveRequest.status !== "PENDING")
      return NextResponse.json({ error: "Đã xử lý" }, { status: 409 })

    // Managers/admins can approve; employees can only CANCEL their own
    if (ctx.role === "employee") {
      if (leaveRequest.employeeId !== ctx.employeeId || action !== "CANCELLED") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const companyId = leaveRequest.companyId

  if (action === "APPROVED") {
    // Tạo DeductionEvents + KpiViolation — 1 record/ngày trong transaction
    // KPI code:
    //   - UNPAID  → "KL" (Không lương)
    //   - khác    → "NP" (Nghỉ phép có hưởng / paid leave)
    const kpiCode = leaveRequest.type === "UNPAID" ? "KL" : "NP"

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
          approvedBy: ctx.userId,
          approvedAt: new Date(),
        },
      })

      // Enumerate working days of the leave range
      const start = new Date(leaveRequest.startDate)
      const end = new Date(leaveRequest.endDate)
      const events: any[] = []
      const workdayDates: Date[] = []
      const cursor = new Date(start)
      while (cursor <= end) {
        const dow = cursor.getUTCDay()
        // Tuần làm 6 ngày: Mon-Sat. Chỉ Chủ nhật (dow=0) bị skip.
        if (dow !== 0) {
          const day = new Date(cursor)
          workdayDates.push(day)
          events.push({
            companyId,
            employeeId: leaveRequest.employeeId,
            leaveRequestId: id,
            date: day,
            type: "NGHI_NGAY" as const,
            delta: -1,
            reason: `${leaveRequest.type === "UNPAID" ? "Nghỉ không lương" : "Nghỉ phép"} — đơn ${id.slice(0, 8)}`,
            status: "APPROVED" as const,
            approvedBy: ctx.userId,
            approvedAt: new Date(),
          })
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }

      if (events.length > 0) {
        await tx.deductionEvent.createMany({ data: events })
      }

      // Merge KPI code into KpiViolation row for each workday.
      // Pattern: if a row already exists for (employeeId, date), add kpiCode
      // to its types array; else create a new row with types=[kpiCode].
      if (workdayDates.length > 0) {
        const existingKpis = await tx.kpiViolation.findMany({
          where: {
            companyId,
            employeeId: leaveRequest.employeeId,
            date: { in: workdayDates },
          },
          select: { id: true, date: true, types: true },
        })
        const existingMap = new Map<string, { id: string; types: string[] }>()
        for (const k of existingKpis) {
          existingMap.set((k.date as Date).toISOString().slice(0, 10), {
            id: k.id,
            types: k.types,
          })
        }

        const approver = await tx.user.findUnique({
          where: { id: ctx.userId },
          select: { email: true },
        })
        const sourceBy = approver?.email ?? ctx.userId

        for (const day of workdayDates) {
          const key = day.toISOString().slice(0, 10)
          const existing = existingMap.get(key)
          if (existing) {
            if (!existing.types.includes(kpiCode)) {
              await tx.kpiViolation.update({
                where: { id: existing.id },
                data: { types: [...existing.types, kpiCode], source: "MANUAL", sourceBy },
              })
            }
          } else {
            await tx.kpiViolation.create({
              data: {
                companyId,
                employeeId: leaveRequest.employeeId,
                date: day,
                types: [kpiCode],
                note: `Tự động từ đơn ${leaveRequest.type === "UNPAID" ? "nghỉ không lương" : "nghỉ phép"} ${id.slice(0, 8)}`,
                source: "MANUAL",
                sourceBy,
              },
            })
          }
        }
      }

      await tx.auditLog.create({
        data: {
          companyId,
          entityType: "LeaveRequest",
          entityId: id,
          action: "APPROVED",
          changedBy: ctx.userId,
          changes: {
            totalDays: events.length,
            type: leaveRequest.type,
            kpiCode,
          },
        },
      })
    })
  } else {
    // REJECTED or CANCELLED — undo side-effects if any
    const kpiCode = leaveRequest.type === "UNPAID" ? "KL" : "NP"
    await db.$transaction(async (tx: any) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: action,
          approvedBy: ctx.userId,
          approvedAt: new Date(),
        },
      })
      await tx.deductionEvent.deleteMany({ where: { leaveRequestId: id } })

      // Remove the KPI code from any rows that were set by this leave's range.
      // Iterate the range again (cheap: at most ~30 days) and strip kpiCode.
      const start = new Date(leaveRequest.startDate)
      const end = new Date(leaveRequest.endDate)
      const workdayDates: Date[] = []
      const cursor = new Date(start)
      while (cursor <= end) {
        const dow = cursor.getUTCDay()
        // Tuần làm 6 ngày: Mon-Sat. Chỉ Chủ nhật (dow=0) bị skip.
        if (dow !== 0) workdayDates.push(new Date(cursor))
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
      if (workdayDates.length > 0) {
        const rows = await tx.kpiViolation.findMany({
          where: {
            companyId,
            employeeId: leaveRequest.employeeId,
            date: { in: workdayDates },
          },
          select: { id: true, types: true },
        })
        for (const r of rows) {
          if (!r.types.includes(kpiCode)) continue
          const remaining = r.types.filter((t: string) => t !== kpiCode)
          if (remaining.length === 0) {
            await tx.kpiViolation.delete({ where: { id: r.id } })
          } else {
            await tx.kpiViolation.update({ where: { id: r.id }, data: { types: remaining } })
          }
        }
      }
    })
  }

    const updated = await db.leaveRequest.findUnique({ where: { id } })
    return NextResponse.json(updated)
  } catch (e) {
    return errorResponse(e)
  }
}
