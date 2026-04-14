/**
 * Locks in the Phase 5b insurance extraction from payroll.service.ts.
 *
 * Same regression-lock pattern as payroll-pit.test.ts: every sample here
 * was hand-computed against the ORIGINAL inline math, so any drift means
 * the extracted helper no longer matches production. BH deductions touch
 * every employee payslip and feed directly into PIT + net salary.
 *
 * Current VN employee-side rates (DEFAULT_INSURANCE_RATES):
 *   BHXH 8%   BHYT 1.5%   BHTN 1%   → total 10.5%
 */
import { describe, it, expect } from "vitest"
import {
  calcEmployeeInsurance,
  DEFAULT_INSURANCE_RATES,
} from "@/lib/payroll/insurance"

const RATES = { ...DEFAULT_INSURANCE_RATES }

describe("calcEmployeeInsurance — enabled=true", () => {
  it("computes the three deductions + total on a round base (10M)", () => {
    const r = calcEmployeeInsurance(10_000_000, RATES, true)
    expect(r.bhxhEmployee).toBe(800_000)  // 10M × 8%
    expect(r.bhytEmployee).toBe(150_000)  // 10M × 1.5%
    expect(r.bhtnEmployee).toBe(100_000)  // 10M × 1%
    expect(r.total).toBe(1_050_000)       // = 10.5% of 10M
  })

  it("rounds each component independently (matches inline Math.round)", () => {
    // 8_333_333 × 0.08 = 666_666.64 → round to 666_667
    // 8_333_333 × 0.015 = 124_999.995 → round to 125_000
    // 8_333_333 × 0.01 = 83_333.33 → round to 83_333
    const r = calcEmployeeInsurance(8_333_333, RATES, true)
    expect(r.bhxhEmployee).toBe(666_667)
    expect(r.bhytEmployee).toBe(125_000)
    expect(r.bhtnEmployee).toBe(83_333)
    expect(r.total).toBe(666_667 + 125_000 + 83_333)
  })

  it("accepts custom rates (non-default values)", () => {
    const custom = { bhxh: 0.1, bhyt: 0.02, bhtn: 0.015 }
    const r = calcEmployeeInsurance(5_000_000, custom, true)
    expect(r.bhxhEmployee).toBe(500_000)
    expect(r.bhytEmployee).toBe(100_000)
    expect(r.bhtnEmployee).toBe(75_000)
    expect(r.total).toBe(675_000)
  })
})

describe("calcEmployeeInsurance — disabled / edge cases", () => {
  it("zero-outs all three amounts when enabled=false", () => {
    const r = calcEmployeeInsurance(10_000_000, RATES, false)
    expect(r.bhxhEmployee).toBe(0)
    expect(r.bhytEmployee).toBe(0)
    expect(r.bhtnEmployee).toBe(0)
    expect(r.total).toBe(0)
  })

  it("returns zeros for baseSalary=0", () => {
    const r = calcEmployeeInsurance(0, RATES, true)
    expect(r.total).toBe(0)
  })

  it("returns zeros for negative base (defensive)", () => {
    const r = calcEmployeeInsurance(-1000, RATES, true)
    expect(r.total).toBe(0)
  })
})

describe("DEFAULT_INSURANCE_RATES", () => {
  it("matches the hardcoded fallback values in payroll.service.ts", () => {
    // These are the fallbacks used in getInsuranceRates when the DB has no
    // InsuranceRate rows. Locking in so a refactor of that loader can't
    // silently drift from the rates this helper assumes.
    expect(DEFAULT_INSURANCE_RATES.bhxh).toBe(0.08)
    expect(DEFAULT_INSURANCE_RATES.bhyt).toBe(0.015)
    expect(DEFAULT_INSURANCE_RATES.bhtn).toBe(0.01)
  })
})
