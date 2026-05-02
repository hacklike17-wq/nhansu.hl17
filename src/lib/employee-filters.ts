/**
 * Single source of truth for "ai bị loại khỏi quy trình lương".
 *
 * Áp ở entry points (cron auto-fill, sheet-sync, payroll generation, dashboard,
 * exports, AI tools) — KHÔNG đụng vào salary calc logic. Một NV được loại
 * (excludeFromPayroll=true) sẽ không được sinh thêm WorkUnit, Payroll record,
 * không xuất hiện trên báo cáo/export, không bị cron auto-fill.
 *
 * NGOẠI LỆ — admin vẫn xuất hiện ở:
 *   - /nhanvien (để admin tự edit profile mình)
 *   - /api/employees self-lookup
 *   - AI tool get_employee_payroll khi caller chỉ định cụ thể empId/code
 */

/** Filter clause for Prisma `where:` — chỉ lấy NV còn nằm trong quy trình lương. */
export const PAYROLL_INCLUDED_WHERE = { excludeFromPayroll: false } as const

/**
 * Runtime check khi đã có Employee object trong tay.
 * `excludeFromPayroll` là Boolean nhưng có thể là `undefined` nếu select
 * không lấy field — caller nên đảm bảo select.
 */
export function isPayrollExcluded(emp: { excludeFromPayroll?: boolean | null } | null | undefined): boolean {
  return emp?.excludeFromPayroll === true
}
