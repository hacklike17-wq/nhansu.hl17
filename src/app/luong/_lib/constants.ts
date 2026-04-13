/**
 * Constants for the Lương & Thưởng page.
 * Extracted from page.tsx for readability — no logic changes.
 */

export type PayrollStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'LOCKED' | 'PAID'

/** Status badge config — flow: admin sends → employee confirms/rejects */
export const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:    { label: 'Nháp',              cls: 'bg-gray-100 text-gray-600' },
  PENDING:  { label: 'Chờ NV xác nhận',   cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt',          cls: 'bg-green-100 text-green-700' }, // legacy rows
  LOCKED:   { label: 'Đã xác nhận',       cls: 'bg-green-100 text-green-700' },
  PAID:     { label: 'Đã thanh toán',     cls: 'bg-blue-100 text-blue-700' },
}

/** Map salary column key → payroll record field */
export const COL_FIELD: Record<string, string> = {
  luong_co_ban:      'baseSalary',
  luong_trach_nhiem: 'responsibilitySalary',
  tong_luong_co_ban: 'workSalary',
  cong_so:           'netWorkUnits',
  gio_tang_ca:       'overtimeHours',
  tien_tang_ca:      'overtimePay',
  kpi_chuyen_can:    'kpiChuyenCan',
  kpi_trach_nhiem:   'kpiTrachNhiem',
  tien_an:           'mealPay',
  tien_phu_cap:      'tienPhuCap',
  phu_cap:           'tienPhuCap',
  thuong:            'bonus',
  phat:              'tienPhat',
  tien_phat:         'tienPhat',
  tong_thuc_nhan:    'netSalary',
}

/**
 * Phase 05: Manual-input columns — editable for DRAFT payrolls.
 * Maps SalaryColumn.key → the SalaryValue columnKey to save.
 */
export const MANUAL_INPUT_MAP: Record<string, string> = {
  phu_cap:        'phu_cap',
  tien_phu_cap:   'phu_cap',   // legacy alias → save as phu_cap
  thuong:         'thuong',
  phat:           'phat',
  tien_phat:      'phat',      // legacy alias → save as phat
  kpi_chuyen_can: 'kpi_chuyen_can',
  kpi_trach_nhiem:'kpi_trach_nhiem',
}

/** Column display style by key */
export type ColStyle = 'currency' | 'number' | 'deduction' | 'ot' | 'total'

export const COL_STYLE: Record<string, ColStyle> = {
  cong_so:        'number',
  gio_tang_ca:    'number',
  tien_tang_ca:   'ot',
  kpi_chuyen_can: 'currency',   // KPI chuyên cần là tiền thưởng (dương)
  kpi_trach_nhiem:'currency',   // KPI trách nhiệm là tiền thưởng (dương)
  tien_phat:      'deduction',
  tong_thuc_nhan: 'total',
}
