import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"

/**
 * GET /api/dashboard/my-attendance-summary?month=YYYY-MM
 *
 * Aggregates the caller's attendance metrics for the given month (default
 * = current month).
 *
 * Returns:
 *  - daysWorked        : sum of WorkUnit.units for the month
 *  - daysExpectedSoFar : count of weekdays from day 1 → today (or last day
 *                        of month if month is in the past)
 *  - overtimeHours     : sum of OvertimeEntry.hours
 *  - overtimePay       : Payroll.overtimePay (already calculated by service)
 *  - unpaidLeaveDays   : sum of LeaveRequest.totalDays where type=UNPAID
 *                        AND status=APPROVED AND startDate falls in month
 *
 * Scope: server-forced session.employeeId (no override).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession()
    if (!ctx.employeeId || !ctx.companyId) {
      return NextResponse.json({
        month: null,
        daysWorked: 0,
        daysExpectedSoFar: 0,
        overtimeHours: 0,
        overtimePay: 0,
        unpaidLeaveDays: 0,
      })
    }

    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get("month")
    const now = new Date()
    const [year, monthNum] =
      monthParam && /^\d{4}-\d{2}$/.test(monthParam)
        ? monthParam.split("-").map(Number)
        : [now.getUTCFullYear(), now.getUTCMonth() + 1]

    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1))
    const monthEnd = new Date(Date.UTC(year, monthNum, 0))

    // "So far" means up to today if viewing current month, else end of month
    const isCurrentMonth =
      year === now.getUTCFullYear() && monthNum === now.getUTCMonth() + 1
    const cutoffDay = isCurrentMonth ? now.getUTCDate() : monthEnd.getUTCDate()

    // Tuần làm 6 ngày: Mon–Sat. Chỉ Chủ nhật (dow=0) bị skip.
    let daysExpectedSoFar = 0
    for (let d = 1; d <= cutoffDay; d++) {
      const dow = new Date(Date.UTC(year, monthNum - 1, d)).getUTCDay()
      if (dow !== 0) daysExpectedSoFar++
    }

    const [workAgg, otAgg, payroll, unpaidLeaves] = await Promise.all([
      db.workUnit.aggregate({
        where: {
          companyId: ctx.companyId,
          employeeId: ctx.employeeId,
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { units: true },
      }),
      db.overtimeEntry.aggregate({
        where: {
          companyId: ctx.companyId,
          employeeId: ctx.employeeId,
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { hours: true },
      }),
      db.payroll.findUnique({
        where: { employeeId_month: { employeeId: ctx.employeeId, month: monthStart } },
        select: { overtimePay: true },
      }),
      db.leaveRequest.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: ctx.employeeId,
          type: "UNPAID",
          status: "APPROVED",
          startDate: { gte: monthStart, lte: monthEnd },
        },
        select: { totalDays: true },
      }),
    ])

    return NextResponse.json(
      {
        month: `${year}-${String(monthNum).padStart(2, "0")}`,
        daysWorked: Number(workAgg._sum.units ?? 0),
        daysExpectedSoFar,
        overtimeHours: Number(otAgg._sum.hours ?? 0),
        overtimePay: payroll ? Number(payroll.overtimePay) : 0,
        unpaidLeaveDays: unpaidLeaves.reduce((s, r) => s + r.totalDays, 0),
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
