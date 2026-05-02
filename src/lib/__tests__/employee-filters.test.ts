import { describe, it, expect } from "vitest"
import { isPayrollExcluded, PAYROLL_INCLUDED_WHERE } from "../employee-filters"

describe("isPayrollExcluded", () => {
  it("returns true khi excludeFromPayroll=true", () => {
    expect(isPayrollExcluded({ excludeFromPayroll: true })).toBe(true)
  })

  it("returns false khi excludeFromPayroll=false", () => {
    expect(isPayrollExcluded({ excludeFromPayroll: false })).toBe(false)
  })

  it("returns false khi field undefined (NV cũ chưa migrate)", () => {
    expect(isPayrollExcluded({})).toBe(false)
  })

  it("returns false khi field null", () => {
    expect(isPayrollExcluded({ excludeFromPayroll: null })).toBe(false)
  })

  it("returns false khi emp null/undefined (defensive)", () => {
    expect(isPayrollExcluded(null)).toBe(false)
    expect(isPayrollExcluded(undefined)).toBe(false)
  })
})

describe("PAYROLL_INCLUDED_WHERE", () => {
  it("filter clause khớp đúng nhân viên không bị loại", () => {
    expect(PAYROLL_INCLUDED_WHERE).toEqual({ excludeFromPayroll: false })
  })
})
