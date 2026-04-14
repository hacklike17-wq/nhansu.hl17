/**
 * Payroll anomaly detection — Phase 5c extraction.
 *
 * Pure function, no DB. Moved verbatim from payroll.service.ts. The rule
 * set and severity levels are unchanged:
 *
 *   NEGATIVE_NET              error   — net salary < 0
 *   EXCESS_ATTENDANCE         error   — công số > 31
 *   TAX_EXCEEDS_GROSS         error   — PIT > gross (> 0)
 *   ZERO_GROSS_WITH_ATTENDANCE warning — gross = 0 but công > 0
 *   LARGE_CHANGE              warning — net differs ≥ 30% from prior month
 *
 * Error-level anomalies block DRAFT → PENDING in the state machine;
 * warning-level anomalies are shown in the UI but don't block.
 */

export type AnomalySeverity = "error" | "warning"

export interface Anomaly {
  rule: string
  severity: AnomalySeverity
  message: string
}

export type AnomalyPayrollInput = {
  netSalary: number
  congSoNhan: number
  grossSalary: number
  pitTax: number
}

/**
 * Check a computed payroll result for suspicious/impossible values.
 *
 * `prev` is the previous month's row for the same employee (may be null
 * or undefined if there's no prior month yet). Passing a value enables
 * the LARGE_CHANGE warning.
 */
export function checkPayrollAnomalies(
  payroll: AnomalyPayrollInput,
  prev?: { netSalary: number } | null
): Anomaly[] {
  const anomalies: Anomaly[] = []

  if (payroll.netSalary < 0)
    anomalies.push({ rule: "NEGATIVE_NET", severity: "error", message: "Lương thực nhận âm" })

  if (payroll.congSoNhan > 31)
    anomalies.push({ rule: "EXCESS_ATTENDANCE", severity: "error", message: "Công số nhận vượt quá 31 ngày" })

  if (payroll.pitTax > payroll.grossSalary && payroll.grossSalary > 0)
    anomalies.push({ rule: "TAX_EXCEEDS_GROSS", severity: "error", message: "Thuế PIT lớn hơn lương gross" })

  if (payroll.grossSalary === 0 && payroll.congSoNhan > 0)
    anomalies.push({ rule: "ZERO_GROSS_WITH_ATTENDANCE", severity: "warning", message: "Lương gross = 0 dù có công số" })

  if (prev && prev.netSalary > 0) {
    const change = Math.abs(payroll.netSalary - prev.netSalary) / prev.netSalary
    if (change > 0.3)
      anomalies.push({
        rule: "LARGE_CHANGE",
        severity: "warning",
        message: `Lương thay đổi ${Math.round(change * 100)}% so tháng trước`,
      })
  }

  return anomalies
}
