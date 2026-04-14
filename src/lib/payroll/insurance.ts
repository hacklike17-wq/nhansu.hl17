/**
 * Employee insurance calculation helpers — Phase 5b extraction.
 *
 * Pure math, no DB. The `getInsuranceRates(companyId)` DB loader stays in
 * payroll.service.ts because it has a live SQL query; this module only
 * owns the final multiplication that turns `(baseSalary, rates)` into the
 * three BH* deductions. Previously those were 3 inline lines inside
 * `upsertPayroll` (calculated twice — once in the main calc path and once
 * for the snapshot builder).
 *
 * Nothing about the math has changed: the multipliers, rounding direction
 * (`Math.round`), and the `enableInsuranceTax=false` zero-out path mirror
 * the original implementation exactly. See `payroll-insurance.test.ts`
 * for the regression lock.
 */

/** Default VN employee rates used when DB has no InsuranceRate rows. */
export const DEFAULT_INSURANCE_RATES = {
  bhxh: 0.08,
  bhyt: 0.015,
  bhtn: 0.01,
} as const

export type EmployeeInsuranceRates = {
  bhxh: number
  bhyt: number
  bhtn: number
}

export type EmployeeInsuranceAmounts = {
  bhxhEmployee: number
  bhytEmployee: number
  bhtnEmployee: number
  total: number
}

/**
 * Applies the three employee-side insurance rates to the insurable
 * wage (`baseSalary` under the current regime). Rounds each component
 * independently before summing — same as the original inline code.
 *
 * When `enabled` is false (master toggle in Cài đặt → Hệ thống), all
 * amounts collapse to zero without touching the rate multipliers.
 */
export function calcEmployeeInsurance(
  baseSalary: number,
  rates: EmployeeInsuranceRates,
  enabled: boolean
): EmployeeInsuranceAmounts {
  if (!enabled || baseSalary <= 0) {
    return { bhxhEmployee: 0, bhytEmployee: 0, bhtnEmployee: 0, total: 0 }
  }
  const bhxhEmployee = Math.round(baseSalary * rates.bhxh)
  const bhytEmployee = Math.round(baseSalary * rates.bhyt)
  const bhtnEmployee = Math.round(baseSalary * rates.bhtn)
  return {
    bhxhEmployee,
    bhytEmployee,
    bhtnEmployee,
    total: bhxhEmployee + bhytEmployee + bhtnEmployee,
  }
}
