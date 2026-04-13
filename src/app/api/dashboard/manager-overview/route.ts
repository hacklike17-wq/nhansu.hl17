import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"

/**
 * GET /api/dashboard/manager-overview
 *
 * Returns today's pulse + action queue + month progress for the Manager
 * dashboard. All numbers come straight from DB queries — no hardcoded
 * values. Salary calculation logic is NOT touched.
 *
 * Timezone: "today" is computed in UTC+7 (Asia/Ho_Chi_Minh).
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requirePermission("nhanvien.view")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const companyId = ctx.companyId

    // ── Vietnam-time "today" ──────────────────────────────────────
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000
    const nowVN = new Date(Date.now() + VN_OFFSET_MS)
    const y = nowVN.getUTCFullYear()
    const m = nowVN.getUTCMonth()
    const d = nowVN.getUTCDate()
    const dow = nowVN.getUTCDay()
    // Tuần làm 6 ngày: Mon–Sat. Chỉ Chủ nhật (dow=0) là cuối tuần.
    const isWeekend = dow === 0
    const todayUTC = new Date(Date.UTC(y, m, d))
    const monthStart = new Date(Date.UTC(y, m, 1))
    const monthEndDay = new Date(Date.UTC(y, m + 1, 0))

    // Workdays so far this month (Mon–Sat, day 1 → today)
    let workdaysSoFar = 0
    for (let day = 1; day <= d; day++) {
      const dd = new Date(Date.UTC(y, m, day)).getUTCDay()
      if (dd !== 0) workdaysSoFar++
    }

    // Total workdays in the entire month — denominator for the coverage bar.
    let workdaysInMonth = 0
    for (let day = 1; day <= monthEndDay.getUTCDate(); day++) {
      const dd = new Date(Date.UTC(y, m, day)).getUTCDay()
      if (dd !== 0) workdaysInMonth++
    }

    // Workdays of current week (Mon → today). Vietnam week starts Monday.
    const dayOfWeekMon0 = (dow + 6) % 7 // Mon=0, Sun=6
    const mondayDate = d - dayOfWeekMon0
    const weekDays: Date[] = []
    for (let day = mondayDate; day <= d; day++) {
      if (day < 1) continue
      const dd = new Date(Date.UTC(y, m, day))
      const ddDow = dd.getUTCDay()
      if (ddDow !== 0) weekDays.push(dd)
    }

    // ── Active employees (excluding soft-deleted / NO_ACCOUNT) ────
    const employees = await db.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        accountStatus: { not: "NO_ACCOUNT" },
      },
      select: { id: true },
    })
    const totalEmployees = employees.length
    const employeeIds = employees.map(e => e.id)

    // ── Today queries (skipped on weekend) ────────────────────────
    let workingToday = 0
    let absentNoReason = 0
    let onUnpaidLeave = 0
    let violationsToday = 0

    if (!isWeekend && employeeIds.length > 0) {
      const [todayWorkUnits, todayUnpaidLeaves, todayKpi] = await Promise.all([
        db.workUnit.findMany({
          where: { companyId, employeeId: { in: employeeIds }, date: todayUTC },
          select: { employeeId: true, units: true },
        }),
        db.leaveRequest.findMany({
          where: {
            companyId,
            employeeId: { in: employeeIds },
            type: "UNPAID",
            status: "APPROVED",
            startDate: { lte: todayUTC },
            endDate: { gte: todayUTC },
          },
          select: { employeeId: true },
        }),
        db.kpiViolation.count({
          where: { companyId, employeeId: { in: employeeIds }, date: todayUTC },
        }),
      ])

      const workingSet = new Set<string>()
      for (const w of todayWorkUnits) {
        if (Number(w.units) > 0) workingSet.add(w.employeeId)
      }
      const onUnpaidLeaveSet = new Set(todayUnpaidLeaves.map(l => l.employeeId))

      workingToday = workingSet.size
      onUnpaidLeave = onUnpaidLeaveSet.size
      violationsToday = todayKpi

      // "Vắng không lý do" — chỉ tính khi đã có WorkUnit cho ai đó hôm nay
      // (= chắc chắn manager đã bắt đầu nhập công), và NV này không có cả WorkUnit
      // lẫn UNPAID leave.
      if (todayWorkUnits.length > 0) {
        for (const empId of employeeIds) {
          if (!workingSet.has(empId) && !onUnpaidLeaveSet.has(empId)) {
            absentNoReason++
          }
        }
      }
    }

    // ── Action queue ──────────────────────────────────────────────
    // 1) Missing attendance this week = (employees × week workdays passed) − recorded WorkUnits this week
    let missingAttendanceCount = 0
    if (employeeIds.length > 0 && weekDays.length > 0) {
      const weekStart = weekDays[0]
      const weekEnd = weekDays[weekDays.length - 1]
      const recorded = await db.workUnit.count({
        where: {
          companyId,
          employeeId: { in: employeeIds },
          date: { gte: weekStart, lte: weekEnd },
        },
      })
      const expected = employeeIds.length * weekDays.length
      missingAttendanceCount = Math.max(0, expected - recorded)
    }

    // 2) DRAFT payrolls this month
    const draftPayrollCount = await db.payroll.count({
      where: { companyId, month: monthStart, status: "DRAFT" },
    })

    // 3) Pending UNPAID leaves
    const pendingUnpaidLeaves = await db.leaveRequest.count({
      where: { companyId, type: "UNPAID", status: "PENDING" },
    })

    // ── Month progress ────────────────────────────────────────────
    // Coverage = recorded WorkUnits / (employees × ALL workdays in month)
    // 100% means manager has filled in attendance for every employee × every
    // workday of the month (whether via "Khởi tạo công số" or manual entry).
    const monthRecorded = await db.workUnit.count({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        date: { gte: monthStart, lte: monthEndDay },
      },
    })
    const monthExpected = employeeIds.length * workdaysInMonth
    const percent = monthExpected > 0
      ? Math.min(100, Math.round((monthRecorded / monthExpected) * 100))
      : 0

    // Payroll status breakdown for current month
    const statusGroups = await db.payroll.groupBy({
      by: ["status"],
      where: { companyId, month: monthStart },
      _count: { _all: true },
    })
    const payrollByStatus: Record<string, number> = {
      DRAFT: 0,
      PENDING: 0,
      APPROVED: 0,
      LOCKED: 0,
      PAID: 0,
    }
    for (const g of statusGroups) {
      payrollByStatus[g.status] = g._count._all
    }

    return NextResponse.json(
      {
        today: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        currentMonth: `${String(m + 1).padStart(2, "0")}/${y}`,
        isWeekend,
        todayPulse: {
          totalEmployees,
          workingToday,
          absentNoReason,
          onUnpaidLeave,
          violationsToday,
        },
        actionQueue: {
          missingAttendanceCount,
          draftPayrollCount,
          pendingUnpaidLeaves,
        },
        monthProgress: {
          workUnitsRecorded: monthRecorded,
          workUnitsExpected: monthExpected,
          percent,
          payrollByStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
