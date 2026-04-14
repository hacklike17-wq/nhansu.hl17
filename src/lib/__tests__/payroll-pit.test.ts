/**
 * Locks in PIT math after the Phase 5a extraction from payroll.service.ts.
 *
 * These numbers were produced by the ORIGINAL in-service implementation
 * before the extraction — any drift here means the extraction changed
 * output, which it must not. The progressive bracket calculation is the
 * load-bearing tax math for every employee payslip.
 *
 * Reference schedule (Vietnam 2024, monthly):
 *   0 ...        5M → 5%
 *   5M ...      10M → 10%
 *   10M ...     18M → 15%
 *   18M ...     32M → 20%
 *   32M ...     52M → 25%
 *   52M ...     80M → 30%
 *   80M+             → 35%
 */
import { describe, it, expect } from "vitest"
import {
  calcPIT,
  calcPITFallback,
  FALLBACK_BRACKETS,
  type PITBracketRecord,
} from "@/lib/payroll/pit"

// Build the bracket records that calcPIT expects. Decimal values are
// faked with a string wrapper so we don't depend on Prisma in tests.
const decimal = (n: number) => ({ toString: () => String(n) })
const DB_BRACKETS: PITBracketRecord[] = FALLBACK_BRACKETS.map(b => ({
  minIncome: decimal(b.min),
  maxIncome: b.max === Infinity ? null : decimal(b.max),
  rate: decimal(b.rate),
}))

describe("calcPITFallback", () => {
  it("returns 0 for non-positive taxable income", () => {
    expect(calcPITFallback(0)).toBe(0)
    expect(calcPITFallback(-1_000_000)).toBe(0)
  })

  it("taxes 4M at exactly 5% (first bracket)", () => {
    // 4M × 5% = 200k
    expect(calcPITFallback(4_000_000)).toBe(200_000)
  })

  it("taxes 5M at exactly the first bracket boundary", () => {
    // whole 5M × 5% = 250k
    expect(calcPITFallback(5_000_000)).toBe(250_000)
  })

  it("crosses into the second bracket at 7M", () => {
    // 5M × 5% + 2M × 10% = 250k + 200k = 450k
    expect(calcPITFallback(7_000_000)).toBe(450_000)
  })

  it("spans first three brackets at 15M", () => {
    // 5M × 5% + 5M × 10% + 5M × 15% = 250k + 500k + 750k = 1,500k
    expect(calcPITFallback(15_000_000)).toBe(1_500_000)
  })

  it("matches the full 80M boundary result", () => {
    // 5M×5% + 5M×10% + 8M×15% + 14M×20% + 20M×25% + 28M×30%
    // = 250k + 500k + 1,200k + 2,800k + 5,000k + 8,400k = 18,150k
    expect(calcPITFallback(80_000_000)).toBe(18_150_000)
  })

  it("applies 35% marginal rate above 80M", () => {
    // 18.15M (up to 80M) + 20M × 35% = 18.15M + 7M = 25,150k
    expect(calcPITFallback(100_000_000)).toBe(25_150_000)
  })
})

describe("calcPIT (DB-bracket path)", () => {
  it("matches calcPITFallback when fed the same schedule from the DB", () => {
    const samples = [
      0, 500_000, 4_999_999, 5_000_000, 5_000_001,
      10_000_000, 15_000_000, 32_000_000, 80_000_000, 150_000_000,
    ]
    for (const income of samples) {
      expect(
        calcPIT(income, DB_BRACKETS),
        `mismatch at taxable income = ${income}`
      ).toBe(calcPITFallback(income))
    }
  })

  it("treats a null maxIncome as the open-ended top bracket", () => {
    const brackets: PITBracketRecord[] = [
      { minIncome: decimal(0), maxIncome: decimal(10_000_000), rate: decimal(0.1) },
      { minIncome: decimal(10_000_000), maxIncome: null,       rate: decimal(0.2) },
    ]
    // 5M × 10% = 500k
    expect(calcPIT(5_000_000, brackets)).toBe(500_000)
    // 10M × 10% + 20M × 20% = 1M + 4M = 5M
    expect(calcPIT(30_000_000, brackets)).toBe(5_000_000)
  })

  it("returns 0 for 0-income regardless of bracket config", () => {
    expect(calcPIT(0, DB_BRACKETS)).toBe(0)
    expect(calcPIT(-100, DB_BRACKETS)).toBe(0)
  })
})
