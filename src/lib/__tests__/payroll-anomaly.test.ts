/**
 * Locks in checkPayrollAnomalies after the Phase 5c extraction from
 * payroll.service.ts. Every rule here mirrors the original inline logic
 * byte-for-byte — these tests guard both the rule predicates and the
 * user-facing messages, because error-level messages are shown directly
 * when DRAFT → PENDING is blocked.
 */
import { describe, it, expect } from "vitest"
import { checkPayrollAnomalies } from "@/lib/payroll/anomaly"

const base = { netSalary: 10_000_000, congSoNhan: 22, grossSalary: 12_000_000, pitTax: 200_000 }

describe("checkPayrollAnomalies — no anomalies", () => {
  it("returns empty array for a healthy payroll", () => {
    expect(checkPayrollAnomalies(base)).toEqual([])
  })

  it("also returns empty with matching prior month", () => {
    expect(checkPayrollAnomalies(base, { netSalary: 10_500_000 })).toEqual([])
  })
})

describe("error-level rules", () => {
  it("NEGATIVE_NET — net < 0", () => {
    const a = checkPayrollAnomalies({ ...base, netSalary: -500_000 })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ rule: "NEGATIVE_NET", severity: "error" })
    expect(a[0].message).toBe("Lương thực nhận âm")
  })

  it("EXCESS_ATTENDANCE — công > 31", () => {
    const a = checkPayrollAnomalies({ ...base, congSoNhan: 32 })
    expect(a[0].rule).toBe("EXCESS_ATTENDANCE")
    expect(a[0].severity).toBe("error")
    expect(a[0].message).toBe("Công số nhận vượt quá 31 ngày")
  })

  it("TAX_EXCEEDS_GROSS — PIT > gross (when gross > 0)", () => {
    const a = checkPayrollAnomalies({ ...base, pitTax: 20_000_000, grossSalary: 12_000_000 })
    expect(a.some(x => x.rule === "TAX_EXCEEDS_GROSS" && x.severity === "error")).toBe(true)
  })

  it("TAX_EXCEEDS_GROSS does NOT trigger when gross = 0", () => {
    const a = checkPayrollAnomalies({ netSalary: 0, congSoNhan: 0, grossSalary: 0, pitTax: 1_000 })
    expect(a.some(x => x.rule === "TAX_EXCEEDS_GROSS")).toBe(false)
  })
})

describe("warning-level rules", () => {
  it("ZERO_GROSS_WITH_ATTENDANCE — gross=0 but công > 0", () => {
    const a = checkPayrollAnomalies({ netSalary: 0, congSoNhan: 20, grossSalary: 0, pitTax: 0 })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ rule: "ZERO_GROSS_WITH_ATTENDANCE", severity: "warning" })
  })

  it("LARGE_CHANGE — |Δnet| / prev > 30%", () => {
    // prev = 10M, current = 14M → change = 40%
    const a = checkPayrollAnomalies({ ...base, netSalary: 14_000_000 }, { netSalary: 10_000_000 })
    const large = a.find(x => x.rule === "LARGE_CHANGE")
    expect(large).toBeDefined()
    expect(large?.severity).toBe("warning")
    expect(large?.message).toMatch(/40%/)
  })

  it("LARGE_CHANGE does NOT fire at exactly 30% (strictly greater)", () => {
    // prev = 10M, current = 13M → change = 30% exactly
    const a = checkPayrollAnomalies({ ...base, netSalary: 13_000_000 }, { netSalary: 10_000_000 })
    expect(a.some(x => x.rule === "LARGE_CHANGE")).toBe(false)
  })

  it("LARGE_CHANGE ignored when prev.netSalary = 0", () => {
    const a = checkPayrollAnomalies({ ...base, netSalary: 5_000_000 }, { netSalary: 0 })
    expect(a.some(x => x.rule === "LARGE_CHANGE")).toBe(false)
  })
})

describe("multiple rules fire together", () => {
  it("collects every matching anomaly into one array", () => {
    const a = checkPayrollAnomalies({
      netSalary: -100,  // NEGATIVE_NET
      congSoNhan: 35,   // EXCESS_ATTENDANCE
      grossSalary: 1_000,
      pitTax: 5_000,    // TAX_EXCEEDS_GROSS
    })
    const rules = a.map(x => x.rule).sort()
    expect(rules).toEqual(
      ["EXCESS_ATTENDANCE", "NEGATIVE_NET", "TAX_EXCEEDS_GROSS"].sort()
    )
  })
})
