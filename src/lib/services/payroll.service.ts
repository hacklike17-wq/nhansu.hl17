import { db } from "@/lib/db"
import { evalFormula, buildDependencyGraph, topologicalSort, extractVars } from "@/lib/formula"
import { calcPIT, calcPITFallback } from "@/lib/payroll/pit"
import { calcEmployeeInsurance } from "@/lib/payroll/insurance"
import { checkPayrollAnomalies, type Anomaly } from "@/lib/payroll/anomaly"
import { getInsuranceRates, getPITBrackets } from "@/lib/payroll/rates-loader"
import { getColumnsForMonth } from "@/lib/payroll/columns-loader"

// Re-export so existing `from "@/lib/services/payroll.service"` imports
// of the Anomaly type / checkPayrollAnomalies function keep working.
export { checkPayrollAnomalies }
export type { Anomaly }

// ─── Types ────────────────────────────────────────────────────────────────────

// Decimal from Prisma comes as an object with toString()
type Decimal = { toString(): string } | null | undefined

function toNum(d: Decimal | null | undefined): number {
  return d ? Number(d.toString()) : 0
}

/** Phase 01b — Error contract for formula evaluation failures */
export interface FormulaError {
  columnKey: string
  columnName: string
  formula: string
  reason: "syntax_error" | "undefined_var" | "cascade" | "invalid_result"
}

/** Formula columns skipped by the formula engine (computed explicitly from calcMode) */
const SKIP_FORMULA_KEYS = new Set(["tong_thuc_nhan"])

// getInsuranceRates / getPITBrackets moved to
//   src/lib/payroll/rates-loader.ts (Phase 5d).
// calcPIT / calcPITFallback          moved to src/lib/payroll/pit.ts (Phase 5a).

// ─── Result type ──────────────────────────────────────────────────────────────

export interface PayrollCalcResult {
  congSoNhan:          number
  congSoTru:           number
  netWorkUnits:        number
  baseSalary:          number
  workSalary:          number            // lương công (baseSalary * netWorkUnits / 26)
  responsibilitySalary:number            // lương trách nhiệm
  overtimeHours:       number            // giờ tăng ca
  overtimePay:         number            // tiền tăng ca
  mealPay:             number            // tiền ăn
  tienPhuCap:          number            // tiền phụ cấp
  kpiChuyenCan:        number            // KPI chuyên cần
  tienPhat:            number            // tiền phạt / tiền trừ khác
  grossSalary:         number
  bhxhEmployee:        number
  bhytEmployee:        number
  bhtnEmployee:        number
  pitTax:              number
  netSalary:           number
  formulaErrors:       FormulaError[]    // Phase 01b: collected errors
  anomalies:           Anomaly[]         // Phase 09: detected anomalies
}

// Anomaly type + checkPayrollAnomalies moved to src/lib/payroll/anomaly.ts
// (Phase 5c). Re-exported at the top of this file for backward compat.

// ─── Phase 08: Versioned column lookup ───────────────────────────────────────

// getColumnsForMonth moved to src/lib/payroll/columns-loader.ts (Phase 5e).

// ─── Main calculation ─────────────────────────────────────────────────────────

/**
 * Tính lương tháng cho một nhân viên.
 * Quy trình:
 *  1. Tổng công số nhận (WorkUnit.units)
 *  2. Tổng công số trừ đã APPROVED (DeductionEvent.delta)
 *  3. Lương công = baseSalary * netCong / 26
 *  4. Tăng ca  = baseSalary / 26 / 8 * totalOtHours * 1.5
 *  5. Lương trách nhiệm (employee.responsibilitySalary)
 *  6. Tiền ăn = netWorkUnits * 35,000
 *  7. Tiền phụ cấp / phạt / KPI từ SalaryValue tháng đó
 *  8. Gross = lương công + tăng ca + trách nhiệm + tiền ăn + phụ cấp - phạt - KPI
 *  9. BH nhân viên trên lương cơ bản (BHXH 8% + BHYT 1.5% + BHTN 1%)
 * 10. Thuế TNCN lũy tiến (giảm trừ gia cảnh 11M)
 * 11. Thực nhận = gross - BH - PIT
 *
 * Phase 01:  Formula columns evaluated in topological order (dep graph).
 * Phase 01b: Bad formulas return null → cascade detection → FormulaError[].
 *            Function never throws — callers always receive a result.
 */
export async function calculatePayroll(
  companyId: string,
  employeeId: string,
  monthDate: Date
): Promise<PayrollCalcResult> {
  const monthStart = new Date(Date.UTC(monthDate.getFullYear(), monthDate.getMonth(), 1))
  const monthEnd   = new Date(Date.UTC(monthDate.getFullYear(), monthDate.getMonth() + 1, 0))

  const [employee, workUnits, deductions, overtimeEntries, salaryValues, insurance, pitBrackets, salaryColumns] =
    await Promise.all([
      db.employee.findUnique({ where: { id: employeeId } }),
      db.workUnit.findMany({
        where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd } },
      }),
      db.deductionEvent.findMany({
        where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd }, status: "APPROVED" },
      }),
      db.overtimeEntry.findMany({
        where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd } },
      }),
      db.salaryValue.findMany({
        where: { companyId, employeeId, month: monthStart },
      }),
      getInsuranceRates(companyId),
      getPITBrackets(companyId),
      // Phase 08: use versioned columns as-of this month
      getColumnsForMonth(companyId, monthDate),
    ])

  // Company-level toggle: enableInsuranceTax
  // Fetched separately so a stale Prisma client (pre-migration) doesn't crash the whole calculation
  let enableInsuranceTax = true
  try {
    const companySettings = await (db.companySettings as any).findUnique({
      where: { companyId },
      select: { enableInsuranceTax: true },
    })
    if (companySettings && typeof companySettings.enableInsuranceTax === "boolean") {
      enableInsuranceTax = companySettings.enableInsuranceTax
    }
  } catch {
    // Prisma client may not know about enableInsuranceTax yet (pending restart) — default true
  }

  if (!employee) throw new Error("Nhân viên không tồn tại")

  const baseSalary            = toNum(employee.baseSalary)
  const responsibilitySalary  = toNum(employee.responsibilitySalary)

  // ── Công số ──────────────────────────────────────────────────
  const congSoNhan   = workUnits.reduce((s: number, w: any) => s + toNum(w.units), 0)
  const congSoTru    = deductions.reduce((s: number, d: any) => s + toNum(d.delta), 0)
  const netWorkUnits = Math.max(0, congSoNhan + congSoTru)

  // ── Tăng ca ───────────────────────────────────────────────────
  const overtimeHours = overtimeEntries.reduce((s: number, o: any) => s + toNum(o.hours), 0)
  const hourlyRate    = baseSalary / 26 / 8

  // ── Phụ cấp / phạt / KPI từ SalaryValue ──────────────────────
  const svMap: Record<string, number> = {}
  for (const sv of salaryValues) {
    svMap[sv.columnKey] = toNum(sv.value)
  }

  // Phase 05: manual input values — prefer new keys, fall back to legacy aliases
  const phuCap        = svMap["tien_phu_cap"]    ?? svMap["phu_cap"]          ?? 0
  const thuong        = svMap["thuong"]           ?? 0
  const phat          = svMap["tien_tru_khac"]   ?? svMap["phat"]             ?? svMap["tien_phat"]       ?? 0
  const kpiChuyenCan  = svMap["kpi_chuyen_can"]  ?? 0

  // Phase 05: manual input keys are injected as both old and new names for formula compatibility
  const tienPhuCap = phuCap
  const tienPhat   = phat

  // ── Build vars map ────────────────────────────────────────────
  // vars holds results from formula eval; keys absent = errored columns (Phase 01b)
  const vars: Record<string, number> = {
    luong_co_ban:      baseSalary,
    luong_trach_nhiem: responsibilitySalary,
    cong_so_nhan:      congSoNhan,
    cong_so_tru:       congSoTru,
    cong_so:           netWorkUnits,    // alias for net_cong_so
    net_cong_so:       netWorkUnits,
    gio_tang_ca:       overtimeHours,
    // Phase 05: manual inputs — new canonical keys
    phu_cap:           phuCap,
    thuong:            thuong,
    phat:              phat,
    tien_tru_khac:     phat,            // canonical name for the deduction column
    // Legacy keys for formula backward compat
    tien_phu_cap:      tienPhuCap,
    tien_phat:         tienPhat,
    kpi_chuyen_can:    kpiChuyenCan,
  }

  // ── Phase 01: evaluate formula columns in topological order ──
  // Phase 01b: null return = error; cascade when dep is missing from vars.
  const formulaErrors: FormulaError[] = []

  // Build dependency graph among formula columns only
  const graph = buildDependencyGraph(
    salaryColumns.map((c: any) => ({ key: c.key, formula: c.formula, type: c.type }))
  )

  // Sort topologically; fall back to DB order on circular dep (should be caught at save time)
  let sortedKeys: string[]
  try {
    sortedKeys = topologicalSort(graph)
  } catch {
    console.warn("calculatePayroll: circular dependency detected — falling back to DB order")
    sortedKeys = salaryColumns.map((c: any) => c.key)
  }

  for (const key of sortedKeys) {
    const col = salaryColumns.find((c: any) => c.key === key)
    if (!col || (col as any).type !== "formula" || !(col as any).formula) continue
    if (SKIP_FORMULA_KEYS.has(key)) continue

    // Cascade detection: if any dependency of this column is absent from vars, it errored.
    const deps = graph[key] ?? []
    const hasCascadeDep = deps.some(dep => !(dep in vars))

    if (hasCascadeDep) {
      formulaErrors.push({
        columnKey:  key,
        columnName: (col as any).name,
        formula:    (col as any).formula,
        reason:     "cascade",
      })
      // Do NOT set vars[key] — absence propagates the cascade
      continue
    }

    const result = evalFormula((col as any).formula, vars)

    if (result === null) {
      formulaErrors.push({
        columnKey:  key,
        columnName: (col as any).name,
        formula:    (col as any).formula,
        reason:     "invalid_result",
      })
      // Do NOT set vars[key]
      continue
    }

    vars[key] = result
  }

  // ── Map formula results back to known fields ──────────────────
  const workSalary  = vars["tong_luong_co_ban"]  ?? Math.round(baseSalary * netWorkUnits / 26)
  const overtimePay = vars["tien_tang_ca"]        ?? Math.round(overtimeHours * hourlyRate * 1.5)
  const mealPay     = vars["tien_an"]             ?? Math.round(netWorkUnits * 35_000)

  // ── Tổng phụ cấp & khấu trừ ──────────────────────────────────
  // KPI chuyên cần là tiền thưởng (dương), không phải khấu trừ
  const totalBonus      = responsibilitySalary + mealPay + tienPhuCap + thuong + kpiChuyenCan
  const totalDeductions = tienPhat

  // ── Lương gộp ─────────────────────────────────────────────────
  const grossSalary = Math.max(0, workSalary + overtimePay + totalBonus - totalDeductions)

  // ── Bảo hiểm (tính trên lương cơ bản) ────────────────────────
  // enableInsuranceTax=false → zero out entirely (toggle from Cài đặt → Hệ thống).
  // Extracted to src/lib/payroll/insurance.ts (Phase 5b).
  const { bhxhEmployee, bhytEmployee, bhtnEmployee, total: totalInsurance } =
    calcEmployeeInsurance(baseSalary, insurance, enableInsuranceTax)

  // ── Thuế TNCN (giảm trừ gia cảnh 11M/tháng) ──────────────────
  const PERSONAL_DEDUCTION = 11_000_000
  const taxableIncome = Math.max(0, grossSalary - totalInsurance - PERSONAL_DEDUCTION)
  const pitTax = !enableInsuranceTax
    ? 0
    : pitBrackets.length > 0
      ? calcPIT(taxableIncome, pitBrackets)
      : calcPITFallback(taxableIncome)

  // ── tong_thuc_nhan: built dynamically from calcMode config ──────
  // If any columns have calcMode configured, use them; otherwise fall back to
  // the standard formula: grossSalary - insurance - PIT.
  const addCols = salaryColumns.filter((c: any) => c.calcMode === "add_to_net")
  const subCols = salaryColumns.filter((c: any) => c.calcMode === "subtract_from_net")

  let netSalary: number
  if (addCols.length > 0 || subCols.length > 0) {
    const addTotal = addCols.reduce((s: number, c: any) => s + (vars[c.key] ?? svMap[c.key] ?? 0), 0)
    const subTotal = subCols.reduce((s: number, c: any) => s + (vars[c.key] ?? svMap[c.key] ?? 0), 0)
    netSalary = Math.max(0, addTotal - subTotal)
  } else {
    // Fallback: no calcMode configured yet — use gross - insurance - PIT
    netSalary = Math.max(0, grossSalary - totalInsurance - pitTax)
  }

  // Phase 09: anomaly detection — compare with previous month if available
  const prevMonthStart = new Date(Date.UTC(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))
  const prevPayroll = await db.payroll.findUnique({
    where: { employeeId_month: { employeeId, month: prevMonthStart } },
    select: { netSalary: true },
  })
  const anomalies = checkPayrollAnomalies(
    { netSalary, congSoNhan, grossSalary, pitTax },
    prevPayroll ? { netSalary: Number(prevPayroll.netSalary) } : null
  )

  return {
    congSoNhan,
    congSoTru,
    netWorkUnits,
    baseSalary,
    workSalary,
    responsibilitySalary,
    overtimeHours,
    overtimePay,
    mealPay,
    tienPhuCap,
    kpiChuyenCan,
    tienPhat,
    grossSalary,
    bhxhEmployee,
    bhytEmployee,
    bhtnEmployee,
    pitTax,
    netSalary,
    formulaErrors,
    anomalies,
  }
}

// ─── Upsert Payroll ───────────────────────────────────────────────────────────

// ─── Phase 03: Data Sync helpers ─────────────────────────────────────────────

/**
 * Phase 03b — Mark all DRAFT Payrolls for a company as needing recalculation.
 * Called when salary column formulas, insurance rates, or PIT brackets change.
 * LOCKED/APPROVED/PAID rows are never touched.
 */
export async function markDraftPayrollsStale(
  companyId: string,
  month?: Date
): Promise<number> {
  const monthFilter = month
    ? { month: new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1)) }
    : {}

  const result = await db.payroll.updateMany({
    where: {
      companyId,
      status: "DRAFT",
      ...monthFilter,
    },
    data: { needsRecalc: true },
  })

  return result.count
}

/**
 * Automatically recalculate DRAFT payroll for a single employee+month.
 * Called after any attendance mutation (WorkUnit, OvertimeEntry, KpiViolation, DeductionEvent).
 * No-ops silently if payroll doesn't exist or is not DRAFT.
 */
export async function autoRecalcDraftPayroll(
  companyId: string,
  employeeId: string,
  dateInMonth: Date
): Promise<void> {
  const monthStart = new Date(Date.UTC(dateInMonth.getFullYear(), dateInMonth.getMonth(), 1))

  const payroll = await db.payroll.findUnique({
    where: { employeeId_month: { employeeId, month: monthStart } },
    select: { status: true },
  })

  // Only recalculate DRAFT payrolls
  if (payroll && payroll.status !== "DRAFT") return

  // If no payroll row exists yet, don't create one — let user trigger explicitly
  if (!payroll) return

  await upsertPayroll(companyId, employeeId, `${dateInMonth.getFullYear()}-${String(dateInMonth.getMonth() + 1).padStart(2, "0")}`)
}

/**
 * Recalculate ALL DRAFT payrolls for a company+month.
 * Called by "Cập nhật lương" button.
 * Returns number of payrolls recalculated.
 */
export async function recalculateMonth(companyId: string, month: Date): Promise<number> {
  const monthStart = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1))

  const draftPayrolls = await db.payroll.findMany({
    where: { companyId, month: monthStart, status: "DRAFT" },
    select: { employeeId: true },
  })

  const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`

  await Promise.all(
    draftPayrolls.map((p: { employeeId: string }) => upsertPayroll(companyId, p.employeeId, monthStr))
  )

  return draftPayrolls.length
}

// ─── Phase 07b: Payroll Snapshot ─────────────────────────────────────────────

export interface PayrollSnapshot {
  capturedAt: string
  lockedBy: string
  vars: Record<string, number>
  formulaResults: Array<{
    columnKey: string
    columnName: string
    formula: string
    result: number | null
  }>
  insuranceRates: {
    bhxhRate: number
    bhytRate: number
    bhtnRate: number
  }
  pitBrackets: Array<{
    minIncome: number
    maxIncome: number | null
    rate: number
  }>
  computed: {
    grossSalary: number
    bhxhEmployee: number
    bhytEmployee: number
    bhtnEmployee: number
    pitTax: number
    netSalary: number
  }
}

/**
 * Build an immutable snapshot of the payroll calculation at lock time.
 * Called OUTSIDE the DB transaction (to avoid long I/O inside tx).
 */
export async function buildPayrollSnapshot(
  companyId: string,
  employeeId: string,
  monthDate: Date,
  lockedBy: string,
  payrollRow: any // the existing Payroll record (pre-lock state)
): Promise<PayrollSnapshot> {
  const monthStart = new Date(Date.UTC(monthDate.getFullYear(), monthDate.getMonth(), 1))
  const monthEnd   = new Date(Date.UTC(monthDate.getFullYear(), monthDate.getMonth() + 1, 0))

  const [employee, workUnits, deductions, overtimeEntries, salaryValues, insurance, pitBrackets, salaryColumns] =
    await Promise.all([
      db.employee.findUnique({ where: { id: employeeId } }),
      db.workUnit.findMany({ where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd } } }),
      db.deductionEvent.findMany({ where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd }, status: "APPROVED" } }),
      db.overtimeEntry.findMany({ where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd } } }),
      db.salaryValue.findMany({ where: { companyId, employeeId, month: monthStart } }),
      getInsuranceRates(companyId),
      getPITBrackets(companyId),
      db.salaryColumn.findMany({ where: { companyId }, orderBy: { order: "asc" } }),
    ])

  const svMap: Record<string, number> = {}
  for (const sv of salaryValues) svMap[sv.columnKey] = toNum(sv.value)

  const phuCap        = svMap["phu_cap"]         ?? svMap["tien_phu_cap"]   ?? 0
  const thuong        = svMap["thuong"]           ?? 0
  const phat          = svMap["tien_tru_khac"]   ?? svMap["phat"]            ?? svMap["tien_phat"]      ?? 0
  const kpiChuyenCan  = svMap["kpi_chuyen_can"]  ?? 0

  const congSoNhan  = workUnits.reduce((s: number, w: any) => s + toNum(w.units), 0)
  const congSoTru   = deductions.reduce((s: number, d: any) => s + toNum(d.delta), 0)
  const netCongSo   = Math.max(0, congSoNhan + congSoTru)
  const overtimeHours = overtimeEntries.reduce((s: number, o: any) => s + toNum(o.hours), 0)

  const vars: Record<string, number> = {
    luong_co_ban:      employee ? toNum(employee.baseSalary) : 0,
    luong_trach_nhiem: employee ? toNum((employee as any).responsibilitySalary) : 0,
    cong_so_nhan:      congSoNhan,
    cong_so_tru:       congSoTru,
    cong_so:           netCongSo,
    net_cong_so:       netCongSo,
    gio_tang_ca:       overtimeHours,
    phu_cap:           phuCap,
    thuong:            thuong,
    phat:              phat,
    tien_tru_khac:     phat,
    tien_phu_cap:      phuCap,
    tien_phat:         phat,
    kpi_chuyen_can:    kpiChuyenCan,
  }

  // Evaluate formulas in topological order
  const graph = buildDependencyGraph(
    salaryColumns.map((c: any) => ({ key: c.key, formula: c.formula, type: c.type }))
  )
  let sortedKeys: string[]
  try {
    sortedKeys = topologicalSort(graph)
  } catch {
    sortedKeys = salaryColumns.map((c: any) => c.key)
  }

  const formulaResults: PayrollSnapshot["formulaResults"] = []
  for (const key of sortedKeys) {
    const col = salaryColumns.find((c: any) => c.key === key)
    if (!col || (col as any).type !== "formula" || !(col as any).formula) continue
    const deps = graph[key] ?? []
    const hasCascadeDep = deps.some(dep => !(dep in vars))
    if (hasCascadeDep) {
      formulaResults.push({ columnKey: key, columnName: (col as any).name, formula: (col as any).formula, result: null })
      continue
    }
    const result = evalFormula((col as any).formula, vars)
    if (result !== null) vars[key] = result
    formulaResults.push({ columnKey: key, columnName: (col as any).name, formula: (col as any).formula, result })
  }

  return {
    capturedAt: new Date().toISOString(),
    lockedBy,
    vars,
    formulaResults,
    insuranceRates: { bhxhRate: insurance.bhxh, bhytRate: insurance.bhyt, bhtnRate: insurance.bhtn },
    pitBrackets: pitBrackets.map((b: any) => ({
      minIncome: toNum(b.minIncome),
      maxIncome: b.maxIncome ? toNum(b.maxIncome) : null,
      rate: toNum(b.rate),
    })),
    computed: {
      grossSalary:  toNum(payrollRow.grossSalary),
      bhxhEmployee: toNum(payrollRow.bhxhEmployee),
      bhytEmployee: toNum(payrollRow.bhytEmployee),
      bhtnEmployee: toNum(payrollRow.bhtnEmployee),
      pitTax:       toNum(payrollRow.pitTax),
      netSalary:    toNum(payrollRow.netSalary),
    },
  }
}

// ─── Upsert Payroll ───────────────────────────────────────────────────────────

/** Tạo hoặc cập nhật Payroll record cho một nhân viên một tháng */
export async function upsertPayroll(
  companyId: string,
  employeeId: string,
  monthStr: string // "YYYY-MM"
) {
  const [year, month] = monthStr.split("-").map(Number)
  const monthDate = new Date(Date.UTC(year, month - 1, 1))

  // Phase 07b guard (pre-emptive): never recalculate non-DRAFT payrolls
  const existing = await db.payroll.findUnique({
    where: { employeeId_month: { employeeId, month: monthDate } },
    select: { status: true },
  })
  if (existing && existing.status !== "DRAFT") {
    console.warn(
      `upsertPayroll: skipping ${employeeId}/${monthStr} — status is ${existing.status}`
    )
    return db.payroll.findUnique({
      where: { employeeId_month: { employeeId, month: monthDate } },
    })
  }

  const calc = await calculatePayroll(companyId, employeeId, monthDate)

  // Log formula errors (Phase 01b) — stored in anomalies later (Phase 09)
  if (calc.formulaErrors.length > 0) {
    console.warn(
      `upsertPayroll: ${calc.formulaErrors.length} formula error(s) for ${employeeId}/${monthStr}:`,
      calc.formulaErrors.map(e => `${e.columnKey}(${e.reason})`).join(", ")
    )
  }

  const { formulaErrors: _, anomalies, ...payrollData } = calc

  return db.payroll.upsert({
    where: { employeeId_month: { employeeId, month: monthDate } },
    create: {
      companyId,
      employeeId,
      month: monthDate,
      ...payrollData,
      status: "DRAFT",
      needsRecalc: false,
      anomalies: anomalies as any,  // Phase 09
    },
    update: {
      ...payrollData,
      needsRecalc: false,
      anomalies: anomalies as any,  // Phase 09
      status: undefined,
    },
  })
}

// Phase 10: Employee self-service — scoped to own payroll only
export async function listForEmployee(companyId: string, employeeId: string, month: Date) {
  if (!employeeId) return []
  const monthStart = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1))
  return db.payroll.findMany({
    where: { companyId, employeeId, month: monthStart },
    include: { employee: { select: { fullName: true, code: true, department: true, position: true } } },
  })
}
