import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"

type TodayStatus = "WORKING" | "UNPAID_LEAVE" | "ABSENT" | "UNKNOWN" | "WEEKEND"

/**
 * GET /api/dashboard/manager-team
 *
 * Returns one row per active employee with: today's status, monthly work
 * progress, KPI violation count, and current-month payroll status.
 *
 * Timezone: "today" computed in UTC+7 (Asia/Ho_Chi_Minh).
 *
 * All numbers come from DB. Salary calculation is NOT touched — we only
 * read Payroll.status.
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requirePermission("nhanvien.view")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const companyId = ctx.companyId

    const VN_OFFSET_MS = 7 * 60 * 60 * 1000
    const nowVN = new Date(Date.now() + VN_OFFSET_MS)
    const y = nowVN.getUTCFullYear()
    const m = nowVN.getUTCMonth()
    const d = nowVN.getUTCDate()
    const dow = nowVN.getUTCDay()
    // Tuần làm 6 ngày: Mon–Sat. Chỉ Chủ nhật là cuối tuần.
    const isWeekend = dow === 0
    const todayUTC = new Date(Date.UTC(y, m, d))
    const monthStart = new Date(Date.UTC(y, m, 1))
    const monthEndDay = new Date(Date.UTC(y, m + 1, 0))

    // Total workdays of the entire month (Mon–Sat). Used as the denominator
    // for "Công tháng" so that 23/26 reads naturally instead of 23/9.
    let workdaysInMonth = 0
    for (let day = 1; day <= monthEndDay.getUTCDate(); day++) {
      const dd = new Date(Date.UTC(y, m, day)).getUTCDay()
      if (dd !== 0) workdaysInMonth++
    }

    const employees = await db.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        accountStatus: { not: "NO_ACCOUNT" },
      },
      select: {
        id: true,
        code: true,
        fullName: true,
        position: true,
        department: true,
      },
      orderBy: [{ department: "asc" }, { fullName: "asc" }],
    })
    const employeeIds = employees.map(e => e.id)

    if (employeeIds.length === 0) {
      return NextResponse.json(
        {
          month: `${y}-${String(m + 1).padStart(2, "0")}`,
          isWeekend,
          workdaysInMonth,
          team: [],
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const [todayWorkUnits, todayUnpaidLeaves, monthWorkUnits, kpiCounts, payrolls] = await Promise.all([
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
      db.workUnit.groupBy({
        by: ["employeeId"],
        where: {
          companyId,
          employeeId: { in: employeeIds },
          date: { gte: monthStart, lte: monthEndDay },
        },
        _sum: { units: true },
      }),
      db.kpiViolation.groupBy({
        by: ["employeeId"],
        where: {
          companyId,
          employeeId: { in: employeeIds },
          date: { gte: monthStart, lte: monthEndDay },
        },
        _count: { _all: true },
      }),
      db.payroll.findMany({
        where: { companyId, month: monthStart, employeeId: { in: employeeIds } },
        select: { employeeId: true, status: true },
      }),
    ])

    const workingToday = new Set<string>()
    for (const w of todayWorkUnits) {
      if (Number(w.units) > 0) workingToday.add(w.employeeId)
    }
    const onUnpaidLeave = new Set(todayUnpaidLeaves.map(l => l.employeeId))
    const someoneHasWorkUnitToday = todayWorkUnits.length > 0

    const monthWorkUnitsMap = new Map<string, number>()
    for (const r of monthWorkUnits) {
      monthWorkUnitsMap.set(r.employeeId, Number(r._sum.units ?? 0))
    }

    const kpiCountMap = new Map<string, number>()
    for (const r of kpiCounts) {
      kpiCountMap.set(r.employeeId, r._count._all)
    }

    const payrollMap = new Map<string, string>()
    for (const p of payrolls) {
      payrollMap.set(p.employeeId, p.status)
    }

    const team = employees.map(e => {
      let todayStatus: TodayStatus
      if (isWeekend) {
        todayStatus = "WEEKEND"
      } else if (onUnpaidLeave.has(e.id)) {
        todayStatus = "UNPAID_LEAVE"
      } else if (workingToday.has(e.id)) {
        todayStatus = "WORKING"
      } else if (someoneHasWorkUnitToday) {
        // Someone has a WorkUnit today → manager started entering → this NV is absent
        todayStatus = "ABSENT"
      } else {
        // No one has a WorkUnit yet → manager hasn't started → unknown
        todayStatus = "UNKNOWN"
      }

      return {
        employeeId: e.id,
        code: e.code,
        fullName: e.fullName,
        position: e.position,
        department: e.department,
        todayStatus,
        monthWorkUnits: monthWorkUnitsMap.get(e.id) ?? 0,
        monthWorkdaysExpected: workdaysInMonth,
        kpiViolationCount: kpiCountMap.get(e.id) ?? 0,
        payrollStatus: payrollMap.get(e.id) ?? null,
      }
    })

    return NextResponse.json(
      {
        month: `${y}-${String(m + 1).padStart(2, "0")}`,
        isWeekend,
        workdaysInMonth,
        team,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
