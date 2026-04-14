/**
 * Single source of truth for salary-column-key metadata.
 *
 * Three maps used to live in different places (`src/app/luong/_lib/constants.ts`,
 * `src/app/luong/page.tsx`, `src/lib/schemas/payroll.ts`); drift across them
 * caused the Phase 2 refactor. Everything below is now the canonical copy
 * and consumers should import from here. The old modules still re-export
 * these values for backwards compatibility.
 *
 * Do NOT change any key string here without also:
 *   1. auditing the Payroll schema (field name may be aliased via COL_FIELD)
 *   2. checking that the corresponding SalaryColumn row exists in DB
 *   3. running `npm test` — the safety-net tests lock in these mappings.
 */

/**
 * Maps a SalaryColumn.key → the corresponding field on the Payroll record.
 * Used by row-helpers `buildRowVars` to populate dynamic columns from the
 * system-computed Payroll row. Custom (non-system) columns have no entry
 * here; they are resolved from `payroll.salaryValues` instead.
 *
 * Note the legacy alias: the manual-input column "tien_tru_khac" still
 * maps to the Prisma field `tienPhat` — renaming the DB column is a
 * separate migration deliberately postponed.
 */
export const COL_FIELD: Record<string, string> = {
  luong_co_ban:      "baseSalary",
  luong_trach_nhiem: "responsibilitySalary",
  tong_luong_co_ban: "workSalary",
  cong_so:           "netWorkUnits",
  gio_tang_ca:       "overtimeHours",
  tien_tang_ca:      "overtimePay",
  kpi_chuyen_can:    "kpiChuyenCan",
  tien_an:           "mealPay",
  tien_phu_cap:      "tienPhuCap",
  tien_tru_khac:     "tienPhat",
  tong_thuc_nhan:    "netSalary",
}

/**
 * Columns that accept manual input from the /luong cell-edit flow.
 * The value side of the map is the `columnKey` stored on the SalaryValue
 * row — in practice identical to the UI key, but legacy aliases (e.g.
 * `tien_phat` → `tien_tru_khac`) are resolved via this map.
 */
export const MANUAL_INPUT_MAP: Record<string, string> = {
  tien_phu_cap:   "tien_phu_cap",
  thuong:         "thuong",
  tien_tru_khac:  "tien_tru_khac",
  kpi_chuyen_can: "kpi_chuyen_can",
}

/**
 * Manual-input columns that support *structured* line-item breakdown
 * (SalaryValueEntry). Adding a column to this list requires also:
 *   - showing it in SalaryEntriesModal
 *   - adding a label to ENTRY_COLUMN_LABELS below
 *   - including it in AI tool payloads (self-tools + admin-tools)
 */
export const ENTRY_ALLOWED_COLUMNS = ["tien_phu_cap", "tien_tru_khac"] as const
export type EntryAllowedColumn = (typeof ENTRY_ALLOWED_COLUMNS)[number]

/** Human-readable labels for the modal header + /luong cell tooltip. */
export const ENTRY_COLUMN_LABELS: Record<EntryAllowedColumn, string> = {
  tien_phu_cap: "Phụ cấp",
  tien_tru_khac: "Trừ khác",
}
