/**
 * Phase 2.2 — admin-scope tools. Each tool is company-scoped via
 * `ctx.companyId` and returns concise JSON suitable for the LLM to
 * summarize to the user.
 *
 * Design rules (keep in sync for Phase 2.3 self-tools):
 *   1. NEVER trust arguments for cross-scoping. `companyId` always comes
 *      from ctx, never from args.
 *   2. Default the `month` arg to current UTC+7 month so the AI doesn't
 *      need to guess the date.
 *   3. Limit list outputs (max 50 rows). Summaries > raw dumps.
 *   4. Return shapes use plain Vietnamese field names when useful, but
 *      keep keys short — every extra token is cost per turn.
 */
import { db } from "@/lib/db"
import type { ToolDefinition, ToolResult, ToolContext } from "./types"

// ── helpers ───────────────────────────────────────────────────────────

function currentMonthVN(): { monthStart: Date; monthEnd: Date; label: string } {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const nowVN = new Date(Date.now() + VN_OFFSET_MS)
  const y = nowVN.getUTCFullYear()
  const m = nowVN.getUTCMonth()
  return {
    monthStart: new Date(Date.UTC(y, m, 1)),
    monthEnd: new Date(Date.UTC(y, m + 1, 0)),
    label: `${y}-${String(m + 1).padStart(2, "0")}`,
  }
}

function parseMonthArg(
  raw: unknown
): { monthStart: Date; monthEnd: Date; label: string } {
  if (typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number)
    return {
      monthStart: new Date(Date.UTC(y, m - 1, 1)),
      monthEnd: new Date(Date.UTC(y, m, 0)),
      label: raw,
    }
  }
  return currentMonthVN()
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── tools ─────────────────────────────────────────────────────────────

const getCompanyOverview: ToolDefinition = {
  name: "get_company_overview",
  description:
    "Tổng quan toàn công ty cho 1 tháng: sỉ số nhân viên active, tổng lương gross/net, số bảng lương theo trạng thái, tổng vi phạm KPI, độ phủ chấm công. Dùng khi user hỏi 'tháng X công ty tổng thế nào', 'có bao nhiêu nhân viên đang làm', 'tổng lương tháng này là bao nhiêu'.",
  scope: "admin",
  parameters: {
    type: "object",
    properties: {
      month: {
        type: "string",
        description: "Tháng theo định dạng YYYY-MM. Bỏ trống = tháng hiện tại.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const { monthStart, monthEnd, label } = parseMonthArg(args.month)

    const [employees, payrolls, violations, workUnitCount] = await Promise.all([
      db.employee.findMany({
        where: { companyId: ctx.companyId, deletedAt: null, accountStatus: { not: "NO_ACCOUNT" } },
        select: { id: true, status: true },
      }),
      db.payroll.findMany({
        where: { companyId: ctx.companyId, month: monthStart },
        select: { status: true, grossSalary: true, netSalary: true },
      }),
      db.kpiViolation.findMany({
        where: { companyId: ctx.companyId, date: { gte: monthStart, lte: monthEnd } },
        select: { types: true },
      }),
      db.workUnit.count({
        where: { companyId: ctx.companyId, date: { gte: monthStart, lte: monthEnd } },
      }),
    ])

    const active = employees.filter(e => e.status === "WORKING" || e.status === "HALF" || e.status === "REMOTE")
    const totalGross = payrolls.reduce((s, p) => s + toNum(p.grossSalary), 0)
    const totalNet = payrolls.reduce((s, p) => s + toNum(p.netSalary), 0)

    const byStatus: Record<string, number> = { DRAFT: 0, PENDING: 0, APPROVED: 0, LOCKED: 0, PAID: 0 }
    for (const p of payrolls) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1

    let totalViolationCodes = 0
    for (const v of violations) totalViolationCodes += v.types?.length ?? 0

    return {
      ok: true,
      data: {
        month: label,
        totalEmployees: employees.length,
        activeEmployees: active.length,
        totalPayrolls: payrolls.length,
        payrollsByStatus: byStatus,
        totalGrossSalaryVND: totalGross,
        totalNetSalaryVND: totalNet,
        totalWorkUnitsRecorded: workUnitCount,
        totalKpiViolationCodes: totalViolationCodes,
      },
    }
  },
}

const listEmployees: ToolDefinition = {
  name: "list_employees",
  description:
    "Liệt kê nhân viên của công ty với cả VAI TRÒ hệ thống (admin/manager/employee). Có thể lọc theo phòng ban, trạng thái làm việc, hoặc vai trò. Dùng khi user hỏi 'phòng X có ai', 'ai là quản lý', 'ai là admin', 'có bao nhiêu người trong bộ phận Y'. Tối đa 50 nhân viên / lần.",
  scope: "admin",
  parameters: {
    type: "object",
    properties: {
      department: {
        type: "string",
        description: "Lọc theo tên phòng ban (khớp chính xác). Bỏ trống = tất cả phòng.",
      },
      status: {
        type: "string",
        enum: ["WORKING", "HALF", "REMOTE", "LEAVE", "RESIGNED"],
        description: "Lọc theo trạng thái làm việc. Bỏ trống = mọi trạng thái trừ RESIGNED.",
      },
      role: {
        type: "string",
        enum: ["admin", "manager", "employee"],
        description: "Lọc theo vai trò hệ thống. admin=quản trị viên toàn quyền, manager=quản lý, employee=nhân viên thường. Bỏ trống = mọi vai trò.",
      },
      limit: {
        type: "number",
        description: "Giới hạn số dòng trả về, mặc định 50, tối đa 50.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const limit = Math.min(50, Math.max(1, Number(args.limit ?? 50)))
    const where: any = {
      companyId: ctx.companyId,
      deletedAt: null,
    }
    if (typeof args.department === "string" && args.department.trim()) {
      where.department = args.department.trim()
    }
    if (typeof args.status === "string") {
      where.status = args.status
    } else {
      where.status = { not: "RESIGNED" }
    }
    if (typeof args.role === "string" && ["admin", "manager", "employee"].includes(args.role)) {
      where.user = { is: { role: args.role } }
    }

    const rows = await db.employee.findMany({
      where,
      select: {
        id: true,
        code: true,
        fullName: true,
        department: true,
        position: true,
        status: true,
        contractType: true,
        phone: true,
        email: true,
        startDate: true,
        accountStatus: true,
        user: {
          select: { role: true },
        },
      },
      orderBy: [{ department: "asc" }, { fullName: "asc" }],
      take: limit,
    })

    return {
      ok: true,
      data: {
        count: rows.length,
        limit,
        employees: rows.map(e => ({
          id: e.id,
          code: e.code,
          fullName: e.fullName,
          department: e.department,
          position: e.position,
          status: e.status,
          contract: e.contractType,
          phone: e.phone,
          email: e.email,
          startDate: e.startDate?.toISOString().slice(0, 10),
          role: e.user?.role ?? null,
          accountStatus: e.accountStatus,
        })),
      },
    }
  },
}

const getEmployeePayroll: ToolDefinition = {
  name: "get_employee_payroll",
  description:
    "Lấy phiếu lương chi tiết của 1 nhân viên cho 1 tháng: lương cơ bản, công, tăng ca, phụ cấp, trừ, gross, net, trạng thái. Dùng khi user hỏi 'lương tháng X của nhân viên Y', 'Y tháng này được bao nhiêu', 'bảng lương của NV002'.",
  scope: "admin",
  parameters: {
    type: "object",
    properties: {
      employeeId: {
        type: "string",
        description: "ID cuid của nhân viên (hoặc mã NV kiểu 'NV011'). Bắt buộc.",
      },
      month: {
        type: "string",
        description: "Tháng theo định dạng YYYY-MM. Bỏ trống = tháng hiện tại.",
      },
    },
    required: ["employeeId"],
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const rawId = String(args.employeeId ?? "").trim()
    if (!rawId) return { ok: false, error: "Thiếu employeeId" }
    const { monthStart, label } = parseMonthArg(args.month)

    // Accept either cuid or code (e.g. NV011)
    const employee = await db.employee.findFirst({
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
        OR: [{ id: rawId }, { code: rawId }],
      },
      select: {
        id: true,
        code: true,
        fullName: true,
        department: true,
        position: true,
        status: true,
      },
    })
    if (!employee) {
      return { ok: false, error: `Không tìm thấy nhân viên với ID/code "${rawId}"` }
    }

    const payroll = await db.payroll.findUnique({
      where: { employeeId_month: { employeeId: employee.id, month: monthStart } },
    })
    if (!payroll) {
      return {
        ok: true,
        data: {
          employee,
          month: label,
          payroll: null,
          note: "Chưa có bảng lương cho tháng này",
        },
      }
    }

    // Line-item breakdown for tien_phu_cap + tien_tru_khac (other columns
    // don't support entries). Lets the AI answer "tại sao NV011 bị trừ
    // 300k tháng này".
    const entryRows = await db.salaryValue.findMany({
      where: {
        companyId: ctx.companyId,
        employeeId: employee.id,
        month: monthStart,
        columnKey: { in: ["tien_phu_cap", "tien_tru_khac"] },
      },
      include: { entries: { orderBy: { createdAt: "asc" } } },
    })
    const entriesByColumn: Record<string, Array<{ amount: number; reason: string; occurredAt: string | null }>> = {
      tien_phu_cap: [],
      tien_tru_khac: [],
    }
    for (const sv of entryRows) {
      entriesByColumn[sv.columnKey] = sv.entries.map(e => ({
        amount: toNum(e.amount),
        reason: e.reason,
        occurredAt: e.occurredAt ? e.occurredAt.toISOString().slice(0, 10) : null,
      }))
    }

    return {
      ok: true,
      data: {
        employee,
        month: label,
        payroll: {
          status: payroll.status,
          congSoNhan: toNum(payroll.congSoNhan),
          congSoTru: toNum(payroll.congSoTru),
          netWorkUnits: toNum(payroll.netWorkUnits),
          baseSalaryVND: toNum(payroll.baseSalary),
          responsibilitySalaryVND: toNum(payroll.responsibilitySalary),
          workSalaryVND: toNum(payroll.workSalary),
          overtimeHours: toNum(payroll.overtimeHours),
          overtimePayVND: toNum(payroll.overtimePay),
          mealPayVND: toNum(payroll.mealPay),
          tienPhuCapVND: toNum(payroll.tienPhuCap),
          tienPhuCapEntries: entriesByColumn.tien_phu_cap,
          kpiChuyenCanVND: toNum(payroll.kpiChuyenCan),
          tienTruKhacVND: toNum(payroll.tienPhat),
          tienTruKhacEntries: entriesByColumn.tien_tru_khac,
          bhxhEmployeeVND: toNum(payroll.bhxhEmployee),
          bhytEmployeeVND: toNum(payroll.bhytEmployee),
          bhtnEmployeeVND: toNum(payroll.bhtnEmployee),
          pitTaxVND: toNum(payroll.pitTax),
          grossSalaryVND: toNum(payroll.grossSalary),
          netSalaryVND: toNum(payroll.netSalary),
          needsRecalc: payroll.needsRecalc,
        },
      },
    }
  },
}

const getAttendanceSummary: ToolDefinition = {
  name: "get_attendance_summary",
  description:
    "Tóm tắt chấm công cả công ty (hoặc 1 phòng ban) cho 1 tháng: số nhân viên có công, tổng công đã nhập, top người đi nhiều/ít công, tỷ lệ phủ so với ngày làm việc.",
  scope: "admin",
  parameters: {
    type: "object",
    properties: {
      month: {
        type: "string",
        description: "Tháng YYYY-MM. Bỏ trống = hiện tại.",
      },
      department: {
        type: "string",
        description: "Lọc theo phòng ban (khớp chính xác). Bỏ trống = cả công ty.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const { monthStart, monthEnd, label } = parseMonthArg(args.month)

    // Workdays of month (Mon-Sat, skip Sun only — matches rest of codebase)
    const y = monthStart.getUTCFullYear()
    const m = monthStart.getUTCMonth()
    let workdaysInMonth = 0
    for (let d = 1; d <= monthEnd.getUTCDate(); d++) {
      if (new Date(Date.UTC(y, m, d)).getUTCDay() !== 0) workdaysInMonth++
    }

    const empWhere: any = {
      companyId: ctx.companyId,
      deletedAt: null,
      status: { not: "RESIGNED" },
    }
    if (typeof args.department === "string" && args.department.trim()) {
      empWhere.department = args.department.trim()
    }

    const employees = await db.employee.findMany({
      where: empWhere,
      select: { id: true, code: true, fullName: true, department: true },
    })
    const empIds = employees.map(e => e.id)
    const empMap = new Map(employees.map(e => [e.id, e]))

    if (empIds.length === 0) {
      return {
        ok: true,
        data: {
          month: label,
          workdaysInMonth,
          employees: 0,
          totalWorkUnits: 0,
          expectedSlots: 0,
          fillRatePercent: 0,
          topAttendance: [],
          lowAttendance: [],
        },
      }
    }

    const grouped = await db.workUnit.groupBy({
      by: ["employeeId"],
      where: { companyId: ctx.companyId, employeeId: { in: empIds }, date: { gte: monthStart, lte: monthEnd } },
      _sum: { units: true },
    })

    const perEmp = grouped
      .map(g => {
        const emp = empMap.get(g.employeeId)
        return {
          code: emp?.code ?? null,
          fullName: emp?.fullName ?? "?",
          department: emp?.department ?? null,
          totalUnits: toNum(g._sum.units),
        }
      })
      .sort((a, b) => b.totalUnits - a.totalUnits)

    const totalUnits = perEmp.reduce((s, r) => s + r.totalUnits, 0)
    const expectedSlots = empIds.length * workdaysInMonth
    const fillRate = expectedSlots > 0 ? Math.round((totalUnits / expectedSlots) * 100) : 0

    return {
      ok: true,
      data: {
        month: label,
        workdaysInMonth,
        employees: empIds.length,
        totalWorkUnits: totalUnits,
        expectedSlots,
        fillRatePercent: fillRate,
        topAttendance: perEmp.slice(0, 5),
        lowAttendance: perEmp.slice(-5).reverse(),
      },
    }
  },
}

const getKpiViolations: ToolDefinition = {
  name: "get_kpi_violations",
  description:
    "Thống kê vi phạm KPI của công ty cho 1 tháng: tổng số code vi phạm (mỗi ngày có thể có nhiều code), phân bổ theo loại, top người vi phạm nhiều nhất. KpiViolation.types là mảng chuỗi, mỗi phần tử là 1 mã vi phạm.",
  scope: "admin",
  parameters: {
    type: "object",
    properties: {
      month: {
        type: "string",
        description: "Tháng YYYY-MM. Bỏ trống = hiện tại.",
      },
      department: {
        type: "string",
        description: "Lọc theo phòng ban. Bỏ trống = cả công ty.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const { monthStart, monthEnd, label } = parseMonthArg(args.month)

    const empWhere: any = {
      companyId: ctx.companyId,
      deletedAt: null,
    }
    if (typeof args.department === "string" && args.department.trim()) {
      empWhere.department = args.department.trim()
    }
    const employees = await db.employee.findMany({
      where: empWhere,
      select: { id: true, code: true, fullName: true, department: true },
    })
    const empMap = new Map(employees.map(e => [e.id, e]))
    const empIds = employees.map(e => e.id)
    if (empIds.length === 0) {
      return {
        ok: true,
        data: { month: label, totalCodes: 0, byType: {}, topViolators: [] },
      }
    }

    const rows = await db.kpiViolation.findMany({
      where: {
        companyId: ctx.companyId,
        employeeId: { in: empIds },
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { employeeId: true, types: true, date: true },
    })

    let totalCodes = 0
    const byType: Record<string, number> = {}
    const perEmp = new Map<string, number>()

    for (const r of rows) {
      const codes = r.types ?? []
      totalCodes += codes.length
      for (const t of codes) byType[t] = (byType[t] ?? 0) + 1
      perEmp.set(r.employeeId, (perEmp.get(r.employeeId) ?? 0) + codes.length)
    }

    const topViolators = Array.from(perEmp.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([empId, count]) => {
        const emp = empMap.get(empId)
        return {
          code: emp?.code ?? null,
          fullName: emp?.fullName ?? "?",
          department: emp?.department ?? null,
          violations: count,
        }
      })

    return {
      ok: true,
      data: {
        month: label,
        totalCodes,
        byType,
        topViolators,
      },
    }
  },
}

export const ADMIN_TOOLS: ToolDefinition[] = [
  getCompanyOverview,
  listEmployees,
  getEmployeePayroll,
  getAttendanceSummary,
  getKpiViolations,
]
