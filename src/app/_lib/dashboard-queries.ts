import "server-only"
import { db } from "@/lib/db"
import type { CanonicalRole } from "@/constants/data"

/**
 * Role-aware dashboard queries. Every query is gated by role + companyId scoping.
 * No caller may request data for a different company or employee than their context allows.
 */

export type AdminStats = {
  totalEmployees: number
  activeAccounts: number
  pendingPayrolls: number
  approvedPayrolls: number
  pendingLeaves: number
  currentMonthPayrollTotal: number
  currentMonth: string
}

export type ManagerStats = {
  totalEmployees: number
  pendingPayrolls: number
  currentMonthPayrollStatus: { status: string; count: number }[]
  pendingLeaves: number
  currentMonth: string
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

  const [totalEmployees, activeAccounts, pendingPayrolls, approvedPayrolls, pendingLeaves, payrollSum] =
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
    ])

  return {
    totalEmployees,
    activeAccounts,
    pendingPayrolls,
    approvedPayrolls,
    pendingLeaves,
    currentMonthPayrollTotal: Number(payrollSum._sum.netSalary ?? 0),
    currentMonth: formatMonthLabel(monthDate),
  }
}

export async function getManagerStats(companyId: string): Promise<ManagerStats> {
  const monthDate = currentMonthDate()

  const [totalEmployees, pendingPayrolls, statusGroups, pendingLeaves] = await Promise.all([
    db.employee.count({ where: { companyId, deletedAt: null } }),
    db.payroll.count({ where: { companyId, status: "PENDING" } }),
    db.payroll.groupBy({
      by: ["status"],
      where: { companyId, month: monthDate },
      _count: { _all: true },
    }),
    db.leaveRequest.count({ where: { companyId, status: "PENDING" } }),
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

  const [myPayroll, attendanceAgg, myPendingLeaves] = await Promise.all([
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
