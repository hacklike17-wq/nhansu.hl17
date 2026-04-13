import "server-only"
import { db } from "@/lib/db"
import type { CanonicalRole } from "@/constants/data"

/**
 * Role-aware dashboard queries. Every query is gated by role + companyId scoping.
 * No caller may request data for a different company or employee than their context allows.
 */

/** Attendance KPI categories surfaced on the dashboard. */
export const KPI_CATEGORIES = ["DM", "NP", "NS", "KL", "QC"] as const
export type KpiCategory = (typeof KPI_CATEGORIES)[number]
export type KpiBreakdown = Record<KpiCategory, number>

const emptyKpiBreakdown = (): KpiBreakdown => ({ DM: 0, NP: 0, NS: 0, KL: 0, QC: 0 })

/**
 * Aggregate KPI violation counts for the current month.
 * Counts each occurrence of a code inside KpiViolation.types (array column),
 * so one row with types=["DM","KL"] contributes +1 to both DM and KL.
 */
async function getKpiBreakdown(
  companyId: string,
  monthDate: Date,
  employeeId?: string
): Promise<KpiBreakdown> {
  const monthEnd = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)
  )
  const rows = await db.kpiViolation.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      date: { gte: monthDate, lte: monthEnd },
    },
    select: { types: true },
  })
  const out = emptyKpiBreakdown()
  for (const r of rows) {
    for (const t of r.types) {
      if ((KPI_CATEGORIES as readonly string[]).includes(t)) {
        out[t as KpiCategory] += 1
      }
    }
  }
  return out
}

export type AdminStats = {
  totalEmployees: number
  activeAccounts: number
  pendingPayrolls: number
  approvedPayrolls: number
  pendingLeaves: number
  currentMonthPayrollTotal: number
  currentMonth: string
  attendanceKpi: KpiBreakdown
}

export type ManagerStats = {
  totalEmployees: number
  pendingPayrolls: number
  currentMonthPayrollStatus: { status: string; count: number }[]
  pendingLeaves: number
  currentMonth: string
  attendanceKpi: KpiBreakdown
}

export type EmployeeStats = {
  myCurrentPayroll: {
    status: string
    baseSalary: number
    grossSalary: number
    netSalary: number
    needsRecalc: boolean
  } | null
  myAttendanceThisMonth: number
  myPendingLeaves: number
  currentMonth: string
  myAttendanceKpi: KpiBreakdown
}

function currentMonthDate(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function formatMonthLabel(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
}

export async function getAdminStats(companyId: string): Promise<AdminStats> {
  const monthDate = currentMonthDate()

  const [totalEmployees, activeAccounts, pendingPayrolls, approvedPayrolls, pendingLeaves, payrollSum, attendanceKpi] =
    await Promise.all([
      db.employee.count({ where: { companyId, deletedAt: null } }),
      db.user.count({ where: { companyId, employeeId: { not: null } } }),
      db.payroll.count({ where: { companyId, status: "PENDING" } }),
      db.payroll.count({ where: { companyId, status: { in: ["APPROVED", "LOCKED", "PAID"] } } }),
      db.leaveRequest.count({ where: { companyId, status: "PENDING" } }),
      db.payroll.aggregate({
        where: { companyId, month: monthDate },
        _sum: { netSalary: true },
      }),
      getKpiBreakdown(companyId, monthDate),
    ])

  return {
    totalEmployees,
    activeAccounts,
    pendingPayrolls,
    approvedPayrolls,
    pendingLeaves,
    currentMonthPayrollTotal: Number(payrollSum._sum.netSalary ?? 0),
    currentMonth: formatMonthLabel(monthDate),
    attendanceKpi,
  }
}

export async function getManagerStats(companyId: string): Promise<ManagerStats> {
  const monthDate = currentMonthDate()

  const [totalEmployees, pendingPayrolls, statusGroups, pendingLeaves, attendanceKpi] = await Promise.all([
    db.employee.count({ where: { companyId, deletedAt: null } }),
    db.payroll.count({ where: { companyId, status: "PENDING" } }),
    db.payroll.groupBy({
      by: ["status"],
      where: { companyId, month: monthDate },
      _count: { _all: true },
    }),
    db.leaveRequest.count({ where: { companyId, status: "PENDING" } }),
    getKpiBreakdown(companyId, monthDate),
  ])

  return {
    totalEmployees,
    pendingPayrolls,
    currentMonthPayrollStatus: statusGroups.map((g: any) => ({
      status: g.status,
      count: g._count._all,
    })),
    pendingLeaves,
    currentMonth: formatMonthLabel(monthDate),
    attendanceKpi,
  }
}

export async function getEmployeeStats(
  companyId: string,
  employeeId: string
): Promise<EmployeeStats> {
  const monthDate = currentMonthDate()
  const monthStart = monthDate
  const monthEnd = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)
  )

  const [myPayroll, attendanceAgg, myPendingLeaves, myAttendanceKpi] = await Promise.all([
    db.payroll.findUnique({
      where: { employeeId_month: { employeeId, month: monthDate } },
      select: {
        status: true,
        baseSalary: true,
        grossSalary: true,
        netSalary: true,
        needsRecalc: true,
      },
    }),
    db.workUnit.aggregate({
      where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd } },
      _sum: { units: true },
    }),
    db.leaveRequest.count({
      where: { companyId, employeeId, status: "PENDING" },
    }),
    getKpiBreakdown(companyId, monthDate, employeeId),
  ])

  return {
    myCurrentPayroll: myPayroll
      ? {
          status: myPayroll.status,
          baseSalary: Number(myPayroll.baseSalary),
          grossSalary: Number(myPayroll.grossSalary),
          netSalary: Number(myPayroll.netSalary),
          needsRecalc: myPayroll.needsRecalc,
        }
      : null,
    myAttendanceThisMonth: Number(attendanceAgg._sum.units ?? 0),
    myPendingLeaves,
    currentMonth: formatMonthLabel(monthDate),
    myAttendanceKpi,
  }
}

export async function getDashboardData(
  role: CanonicalRole,
  companyId: string | null,
  employeeId: string | null
) {
  if (!companyId) return { role, data: null as any }

  if (role === "admin") {
    return { role, data: await getAdminStats(companyId) }
  }
  if (role === "manager") {
    return { role, data: await getManagerStats(companyId) }
  }
  if (role === "employee" && employeeId) {
    return { role, data: await getEmployeeStats(companyId, employeeId) }
  }
  return { role, data: null }
}
