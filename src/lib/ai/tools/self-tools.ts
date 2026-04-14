/**
 * Phase 2.3 — self-scope tools for manager + employee.
 *
 * Critical: every tool HARD-PINS `employeeId` to `ctx.employeeId`. The LLM
 * never receives employeeId as a parameter, so there is no surface for
 * prompt injection or cross-user data access. If `ctx.employeeId` is
 * missing (user has no linked Employee record — e.g. a bare admin
 * account), all tools return `{ ok: false, error: ... }`.
 *
 * Design mirrors admin-tools.ts for consistency: concise JSON output,
 * month arg defaults to UTC+7 current month, toNum() coercion, etc.
 */
import { db } from "@/lib/db"
import type { ToolDefinition, ToolResult, ToolContext } from "./types"

// ── helpers (duplicated from admin-tools to keep each file self-contained) ─

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

function parseMonthArg(raw: unknown): { monthStart: Date; monthEnd: Date; label: string } {
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

function parseYearArg(raw: unknown): { yearStart: Date; yearEnd: Date; label: string } {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  let y = now.getUTCFullYear()
  if (typeof raw === "string" && /^\d{4}$/.test(raw)) {
    y = Number(raw)
  } else if (typeof raw === "number" && raw >= 2000 && raw <= 2100) {
    y = Math.floor(raw)
  }
  return {
    yearStart: new Date(Date.UTC(y, 0, 1)),
    yearEnd: new Date(Date.UTC(y, 11, 31)),
    label: String(y),
  }
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function ensureEmployeeId(ctx: ToolContext): string | null {
  return ctx.employeeId && ctx.employeeId.trim() ? ctx.employeeId : null
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
}

// ── tools ─────────────────────────────────────────────────────────────────

const getMyInfo: ToolDefinition = {
  name: "get_my_info",
  description:
    "Thông tin cá nhân của người đang hỏi: họ tên, mã nhân viên, phòng ban, chức vụ, loại hợp đồng, ngày vào làm, thâm niên, email, số điện thoại, địa chỉ, ngân hàng. Dùng khi user hỏi 'tôi là ai', 'tôi vào làm từ khi nào', 'lương cơ bản của tôi', 'thâm niên của tôi'.",
  scope: "self",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute(_args, ctx: ToolContext): Promise<ToolResult> {
    const employeeId = ensureEmployeeId(ctx)
    if (!employeeId) {
      return { ok: false, error: "Tài khoản chưa được gắn với hồ sơ nhân viên" }
    }

    const emp = await db.employee.findFirst({
      where: { id: employeeId, companyId: ctx.companyId, deletedAt: null },
      select: {
        id: true,
        code: true,
        fullName: true,
        email: true,
        phone: true,
        gender: true,
        dob: true,
        address: true,
        department: true,
        position: true,
        contractType: true,
        status: true,
        startDate: true,
        endDate: true,
        baseSalary: true,
        responsibilitySalary: true,
        bankName: true,
        bankAccount: true,
      },
    })
    if (!emp) return { ok: false, error: "Không tìm thấy hồ sơ nhân viên của bạn" }

    const today = new Date()
    let tenureMonths = 0
    if (emp.startDate) {
      tenureMonths = Math.max(0, monthsBetween(emp.startDate, today))
    }
    const tenureYears = Math.floor(tenureMonths / 12)
    const tenureLabel =
      tenureYears > 0
        ? `${tenureYears} năm ${tenureMonths % 12} tháng`
        : `${tenureMonths} tháng`

    return {
      ok: true,
      data: {
        code: emp.code,
        fullName: emp.fullName,
        email: emp.email,
        phone: emp.phone,
        gender: emp.gender,
        dob: emp.dob?.toISOString().slice(0, 10),
        address: emp.address,
        department: emp.department,
        position: emp.position,
        contractType: emp.contractType,
        status: emp.status,
        startDate: emp.startDate?.toISOString().slice(0, 10),
        endDate: emp.endDate?.toISOString().slice(0, 10),
        tenureMonths,
        tenureLabel,
        baseSalaryVND: toNum(emp.baseSalary),
        responsibilitySalaryVND: toNum(emp.responsibilitySalary),
        bankName: emp.bankName,
        bankAccount: emp.bankAccount,
      },
    }
  },
}

const getMyPayroll: ToolDefinition = {
  name: "get_my_payroll",
  description:
    "Phiếu lương chi tiết của người đang hỏi cho 1 tháng: công, lương cơ bản, tăng ca, ăn, phụ cấp, trừ, gross, net, trạng thái phiếu. Dùng khi user hỏi 'lương tháng này của tôi', 'tháng trước tôi được bao nhiêu', 'sao tôi bị trừ'.",
  scope: "self",
  parameters: {
    type: "object",
    properties: {
      month: {
        type: "string",
        description: "Tháng YYYY-MM. Bỏ trống = tháng hiện tại.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const employeeId = ensureEmployeeId(ctx)
    if (!employeeId) {
      return { ok: false, error: "Tài khoản chưa được gắn với hồ sơ nhân viên" }
    }
    const { monthStart, label } = parseMonthArg(args.month)

    const payroll = await db.payroll.findUnique({
      where: { employeeId_month: { employeeId, month: monthStart } },
    })
    if (!payroll) {
      return {
        ok: true,
        data: {
          month: label,
          payroll: null,
          note: "Chưa có phiếu lương cho tháng này",
        },
      }
    }

    return {
      ok: true,
      data: {
        month: label,
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
        kpiChuyenCanVND: toNum(payroll.kpiChuyenCan),
        tienTruKhacVND: toNum(payroll.tienPhat),
        bhxhEmployeeVND: toNum(payroll.bhxhEmployee),
        bhytEmployeeVND: toNum(payroll.bhytEmployee),
        bhtnEmployeeVND: toNum(payroll.bhtnEmployee),
        pitTaxVND: toNum(payroll.pitTax),
        grossSalaryVND: toNum(payroll.grossSalary),
        netSalaryVND: toNum(payroll.netSalary),
        needsRecalc: payroll.needsRecalc,
      },
    }
  },
}

const getMyAttendance: ToolDefinition = {
  name: "get_my_attendance",
  description:
    "Chi tiết chấm công của người đang hỏi cho 1 tháng: tổng công net, chi tiết các ngày đã chấm + giá trị, các ngày bị trừ (deductions). Dùng khi user hỏi 'tháng này tôi đi mấy công', 'tôi có bị nghỉ ngày nào không'.",
  scope: "self",
  parameters: {
    type: "object",
    properties: {
      month: {
        type: "string",
        description: "Tháng YYYY-MM. Bỏ trống = hiện tại.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const employeeId = ensureEmployeeId(ctx)
    if (!employeeId) {
      return { ok: false, error: "Tài khoản chưa được gắn với hồ sơ nhân viên" }
    }
    const { monthStart, monthEnd, label } = parseMonthArg(args.month)

    const [workUnits, deductions] = await Promise.all([
      db.workUnit.findMany({
        where: { companyId: ctx.companyId, employeeId, date: { gte: monthStart, lte: monthEnd } },
        select: { date: true, units: true, note: true },
        orderBy: { date: "asc" },
      }),
      db.deductionEvent.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId,
          date: { gte: monthStart, lte: monthEnd },
          status: "APPROVED",
        },
        select: { date: true, type: true, delta: true, reason: true },
        orderBy: { date: "asc" },
      }),
    ])

    const totalUnits = workUnits.reduce((s, w) => s + toNum(w.units), 0)
    const totalDeducted = deductions.reduce((s, d) => s + toNum(d.delta), 0)

    return {
      ok: true,
      data: {
        month: label,
        totalWorkUnitsPlain: totalUnits,
        totalDeductedDays: totalDeducted,
        netWorkUnits: Math.max(0, totalUnits + totalDeducted),
        daysRecorded: workUnits.length,
        workUnits: workUnits.map(w => ({
          date: w.date.toISOString().slice(0, 10),
          units: toNum(w.units),
          note: w.note,
        })),
        deductions: deductions.map(d => ({
          date: d.date.toISOString().slice(0, 10),
          type: d.type,
          delta: toNum(d.delta),
          reason: d.reason,
        })),
      },
    }
  },
}

const getMyKpiViolations: ToolDefinition = {
  name: "get_my_kpi_violations",
  description:
    "Liệt kê vi phạm KPI của người đang hỏi trong 1 tháng. Mỗi vi phạm có mảng `types` (ví dụ ['NP','DM'] = đi muộn + về sớm cùng ngày) và ghi chú. Dùng khi user hỏi 'tôi vi phạm gì tháng này', 'tôi bị trừ điểm gì'.",
  scope: "self",
  parameters: {
    type: "object",
    properties: {
      month: {
        type: "string",
        description: "Tháng YYYY-MM. Bỏ trống = hiện tại.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const employeeId = ensureEmployeeId(ctx)
    if (!employeeId) {
      return { ok: false, error: "Tài khoản chưa được gắn với hồ sơ nhân viên" }
    }
    const { monthStart, monthEnd, label } = parseMonthArg(args.month)

    const rows = await db.kpiViolation.findMany({
      where: {
        companyId: ctx.companyId,
        employeeId,
        date: { gte: monthStart, lte: monthEnd },
      },
      orderBy: { date: "asc" },
      select: { date: true, types: true, note: true },
    })

    let totalCodes = 0
    const byType: Record<string, number> = {}
    for (const r of rows) {
      totalCodes += r.types?.length ?? 0
      for (const t of r.types ?? []) byType[t] = (byType[t] ?? 0) + 1
    }

    return {
      ok: true,
      data: {
        month: label,
        totalCodes,
        byType,
        violations: rows.map(r => ({
          date: r.date.toISOString().slice(0, 10),
          types: r.types,
          note: r.note,
        })),
      },
    }
  },
}

const getMyLeaveHistory: ToolDefinition = {
  name: "get_my_leave_history",
  description:
    "Lịch sử đơn nghỉ phép của người đang hỏi trong 1 năm (mọi trạng thái: PENDING/APPROVED/REJECTED/CANCELLED). Dùng khi user hỏi 'tôi đã nghỉ những ngày nào', 'đơn nghỉ của tôi đã duyệt chưa', 'tôi còn đơn nghỉ chờ duyệt không'.",
  scope: "self",
  parameters: {
    type: "object",
    properties: {
      year: {
        type: "string",
        description: "Năm YYYY. Bỏ trống = năm hiện tại.",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const employeeId = ensureEmployeeId(ctx)
    if (!employeeId) {
      return { ok: false, error: "Tài khoản chưa được gắn với hồ sơ nhân viên" }
    }
    const { yearStart, yearEnd, label } = parseYearArg(args.year)

    const rows = await db.leaveRequest.findMany({
      where: {
        companyId: ctx.companyId,
        employeeId,
        startDate: { gte: yearStart, lte: yearEnd },
      },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        reason: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
      },
    })

    const countByStatus: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 }
    let totalApprovedDays = 0
    for (const r of rows) {
      countByStatus[r.status] = (countByStatus[r.status] ?? 0) + 1
      if (r.status === "APPROVED") totalApprovedDays += r.totalDays
    }

    return {
      ok: true,
      data: {
        year: label,
        totalLeaveRequests: rows.length,
        countByStatus,
        totalApprovedDays,
        leaves: rows.map(r => ({
          type: r.type,
          from: r.startDate.toISOString().slice(0, 10),
          to: r.endDate.toISOString().slice(0, 10),
          days: r.totalDays,
          status: r.status,
          reason: r.reason,
          submittedAt: r.submittedAt.toISOString().slice(0, 10),
        })),
      },
    }
  },
}

export const SELF_TOOLS: ToolDefinition[] = [
  getMyInfo,
  getMyPayroll,
  getMyAttendance,
  getMyKpiViolations,
  getMyLeaveHistory,
]
