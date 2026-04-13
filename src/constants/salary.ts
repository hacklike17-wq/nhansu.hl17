/**
 * Canonical system variable definitions for the formula engine.
 * Phase 06 — single source of truth for all known variable names.
 */
export const SYSTEM_VARS: Array<{ key: string; label: string; description: string }> = [
  { key: 'luong_co_ban',    label: 'Lương cơ bản',         description: 'Employee.baseSalary' },
  { key: 'luong_trach_nhiem', label: 'Lương trách nhiệm',  description: 'Employee.responsibilitySalary' },
  { key: 'cong_so',        label: 'Công thực tế',           description: 'Số công thực tế trong tháng' },
  { key: 'gio_tang_ca',    label: 'Giờ tăng ca',            description: 'Sum of OvertimeEntry.hours in month' },
  { key: 'kpi_score',      label: 'KPI Score',               description: 'Derived from KpiViolation count' },
  { key: 'phu_cap',        label: 'Phụ cấp',                 description: 'SalaryValue[phu_cap] — manual input' },
  { key: 'thuong',         label: 'Thưởng',                   description: 'SalaryValue[thuong] — manual input' },
  { key: 'phat',           label: 'Phạt',                     description: 'SalaryValue[phat] — manual input' },
  { key: 'kpi_chuyen_can', label: 'KPI Chuyên cần',          description: 'SalaryValue[kpi_chuyen_can]' },
  { key: 'kpi_trach_nhiem', label: 'KPI Trách nhiệm',        description: 'SalaryValue[kpi_trach_nhiem]' },
  // Legacy aliases used in existing formulas
  { key: 'tien_phu_cap',   label: 'Tiền phụ cấp (cũ)',      description: 'Legacy alias for phu_cap' },
  { key: 'tien_phat',      label: 'Tiền phạt (cũ)',          description: 'Legacy alias for phat' },
]

export const SYSTEM_VAR_KEYS: string[] = SYSTEM_VARS.map(v => v.key)

/**
 * Keys that CANNOT be used as SalaryColumn.key.
 * Prevents formula injection via column key naming tricks.
 */
export const RESERVED_VARS: Set<string> = new Set([
  ...SYSTEM_VAR_KEYS,
  'tong_thuc_nhan',  // computed last — not a formula column
  'gross_salary',    // reserved for system use
  'net_salary',      // reserved for system use
])

/** Sample vars used for formula preview / validation */
export const SAMPLE_VARS: Record<string, number> = {
  luong_co_ban:      10_000_000,
  luong_trach_nhiem: 1_000_000,
  cong_so:           26,
  gio_tang_ca:       8,
  kpi_score:         100,
  phu_cap:           0,
  thuong:            0,
  phat:              0,
  kpi_chuyen_can:    0,
  kpi_trach_nhiem:   0,
  tien_phu_cap:      0,
  tien_phat:         0,
}
