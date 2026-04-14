/**
 * Personal Income Tax (PIT) helpers — Phase 5a extraction.
 *
 * Pure math, no DB, no side effects. Extracted verbatim from
 * `src/lib/services/payroll.service.ts` as the first step of splitting the
 * 730-line service file. Nothing about the tax math has changed — see the
 * tests in `src/lib/__tests__/payroll-pit.test.ts`, which lock in every
 * bracket boundary that the current production code was already producing.
 *
 * If a future phase needs to edit this module, the rule is: change only
 * after the corresponding test has been added/updated to express the new
 * expected output. Numbers on employee payslips go through here.
 */

/** Coerce a Prisma Decimal (or any numeric-like) to a plain number. */
type DecimalLike = { toString(): string } | null | undefined
function toNum(d: DecimalLike): number {
  return d ? Number(d.toString()) : 0
}

/**
 * Shape of a PITBracket row loaded from DB — narrowed to just the fields
 * `calcPIT` reads, so this module does not have to import from the Prisma
 * client or the service layer. Callers typically pass `db.pITBracket.findMany(...)`
 * results directly; the structural type is compatible.
 */
export type PITBracketRecord = {
  minIncome: DecimalLike
  maxIncome: DecimalLike
  rate: DecimalLike
}

/**
 * Lũy tiến calculator. `brackets` must be sorted ascending by `minIncome`.
 * Each bracket has an optional upper bound (`maxIncome` is null → ∞).
 * Returns the rounded total tax for `taxableIncome`.
 *
 * Behaviour copied from the original payroll.service.ts implementation —
 * the only change is that the function now lives in its own module.
 */
export function calcPIT(taxableIncome: number, brackets: PITBracketRecord[]): number {
  if (taxableIncome <= 0) return 0
  let pit = 0
  for (const b of brackets) {
    const min = toNum(b.minIncome)
    const max = b.maxIncome ? toNum(b.maxIncome) : Infinity
    const rate = toNum(b.rate)
    if (taxableIncome <= min) break
    const slice = Math.min(taxableIncome, max) - min
    pit += slice * rate
  }
  return Math.round(pit)
}

/**
 * Fallback PIT brackets used when the database has no PITBracket rows for
 * the caller's company. Mirrors the Vietnamese 2024 personal income tax
 * schedule (5% / 10% / 15% / 20% / 25% / 30% / 35%).
 */
export const FALLBACK_BRACKETS = [
  { min: 0,          max: 5_000_000,  rate: 0.05 },
  { min: 5_000_000,  max: 10_000_000, rate: 0.1  },
  { min: 10_000_000, max: 18_000_000, rate: 0.15 },
  { min: 18_000_000, max: 32_000_000, rate: 0.2  },
  { min: 32_000_000, max: 52_000_000, rate: 0.25 },
  { min: 52_000_000, max: 80_000_000, rate: 0.3  },
  { min: 80_000_000, max: Infinity,   rate: 0.35 },
] as const

export function calcPITFallback(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  let pit = 0
  for (const b of FALLBACK_BRACKETS) {
    if (taxableIncome <= b.min) break
    const slice = Math.min(taxableIncome, b.max) - b.min
    pit += slice * b.rate
  }
  return Math.round(pit)
}
