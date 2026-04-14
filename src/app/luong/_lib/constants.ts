/**
 * Constants for the Lương & Thưởng page.
 * Extracted from page.tsx for readability — no logic changes.
 *
 * PayrollStatus + STATUS_MAP now live in src/constants/payroll-status.ts as
 * the single source of truth (Phase 1 refactor). This module re-exports them
 * for backwards compatibility with existing import paths.
 */
import { PAYROLL_STATUS_META, type PayrollStatus } from "@/constants/payroll-status"

export type { PayrollStatus }

/**
 * Status badge config — flow: admin sends → employee confirms/rejects.
 * Derived from PAYROLL_STATUS_META so any future label/class change happens
 * in exactly one place.
 */
export const STATUS_MAP: Record<string, { label: string; cls: string }> =
  Object.fromEntries(
    Object.entries(PAYROLL_STATUS_META).map(([k, m]) => [k, { label: m.label, cls: m.cls }])
  )

/**
 * COL_FIELD + MANUAL_INPUT_MAP moved to src/constants/salary-columns.ts
 * as the single source of truth (Phase 2 refactor). Re-exported here so
 * existing `./constants` import paths keep working.
 */
export { COL_FIELD, MANUAL_INPUT_MAP } from "@/constants/salary-columns"

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
