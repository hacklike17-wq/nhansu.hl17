import "server-only"
import { db } from "@/lib/db"
import type { CanonicalRole } from "@/constants/data"

/**
 * Role-aware dashboard queries. Every query is gated by role + companyId scoping.
 * No caller may request data for a different company or employee than their context allows.
 */

/** Attendance KPI categories surfaced on the dashboard. */
export const KPI_CATEGORIES = ["ĐM", "NP", "KL", "LT", "QCC"] as const
export type KpiCategory = (typeof KPI_CATEGORIES)[number]
export type KpiBreakdown = Record<KpiCategory, number>

const emptyKpiBreakdown = (): KpiBreakdown => ({ "ĐM": 0, NP: 0, KL: 0, LT: 0, QCC: 0 })

/**
 * Aggregate KPI violation counts for the current month.
 * Counts each occurrence of a code inside KpiViolation.types (array column),
 * so one row with types=["ĐM","KL"] contributes +1 to both ĐM and KL.
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

export type EmployeePersonalProfile = {
  fullName: string
  code: string | null
  position: string
  department: string
  contractType: string
  startDate: string | null
  tenureLabel: string // "2 năm 3 tháng" — pre-formatted on server
  phone: string | null
  email: string
  bankName: string | null
  bankAccount: string | null
}

export type EmployeeStats = {
  myCurrentPayroll: {
    status: string
    baseSalary: number
    grossSalary: number
    netSalary: number
    needsRecalc: boolean
  } | null
  /** Net salary of the previous month (if any) — used to compute the delta % shown on the hero card. */
  myPreviousMonthNet: number | null
  myAttendanceThisMonth: number
  myPendingLeaves: number
  currentMonth: string
  myAttendanceKpi: KpiBreakdown
  myProfile: EmployeePersonalProfile | null
}

function currentMonthDate(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function formatMonthLabel(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
}

const CONTRACT_LABEL: Record<string, string> = {
  FULL_TIME: "Toàn thời gian",
  PART_TIME: "Bán thời gian",
  INTERN: "Thực tập",
  FREELANCE: "Freelance",
}

/** Format tenure in Vietnamese: "2 năm 3 tháng" / "5 tháng" / "Mới vào" */
function formatTenure(startDate: Date | null): string {
  if (!startDate) return "—"
  const now = new Date()
  let years = now.getUTCFullYear() - startDate.getUTCFullYear()
  let months = now.getUTCMonth() - startDate.getUTCMonth()
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years === 0 && months === 0) return "Mới vào"
  if (years === 0) return `${months} tháng`
  if (months === 0) return `${years} năm`
  return `${years} năm ${months} tháng`
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
  const previousMonthDate = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() - 1, 1)
  )

  const [myPayroll, previousPayroll, attendanceAgg, myPendingLeaves, myAttendanceKpi, employee] =
    await Promise.all([
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
      db.payroll.findUnique({
        where: { employeeId_month: { employeeId, month: previousMonthDate } },
        select: { netSalary: true },
      }),
      db.workUnit.aggregate({
        where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd } },
        _sum: { units: true },
      }),
      db.leaveRequest.count({
        where: { companyId, employeeId, status: "PENDING" },
      }),
      getKpiBreakdown(companyId, monthDate, employeeId),
      db.employee.findFirst({
        where: { id: employeeId, companyId, deletedAt: null },
        select: {
          fullName: true,
          code: true,
          position: true,
          department: true,
          contractType: true,
          startDate: true,
          phone: true,
          email: true,
          bankName: true,
          bankAccount: true,
        },
      }),
    ])

  const profile: EmployeePersonalProfile | null = employee
    ? {
        fullName: employee.fullName,
        code: employee.code,
        position: employee.position,
        department: employee.department,
        contractType: CONTRACT_LABEL[employee.contractType] ?? employee.contractType,
        startDate: employee.startDate ? (employee.startDate as Date).toISOString() : null,
        tenureLabel: formatTenure(employee.startDate as Date | null),
        phone: employee.phone,
        email: employee.email,
        bankName: employee.bankName,
        bankAccount: employee.bankAccount,
      }
    : null

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
    myPreviousMonthNet: previousPayroll ? Number(previousPayroll.netSalary) : null,
    myAttendanceThisMonth: Number(attendanceAgg._sum.units ?? 0),
    myPendingLeaves,
    currentMonth: formatMonthLabel(monthDate),
    myAttendanceKpi,
    myProfile: profile,
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
