/**
 * DB loaders for the "live" (currently-effective) insurance rates and PIT
 * brackets — Phase 5d extraction from payroll.service.ts.
 *
 * These are thin Prisma wrappers with a tiny piece of "pick the row that is
 * valid today" logic (`validFrom <= now AND (validTo IS NULL OR validTo >= now)`).
 * The math that applies them to a payroll lives in the sibling modules
 * `insurance.ts` (Phase 5b) and `pit.ts` (Phase 5a) — this file only knows
 * how to fetch rows, never how to use them.
 *
 * Semantics copied byte-for-byte from payroll.service.ts: same WHERE clause,
 * same fallback defaults (8% / 1.5% / 1% for BHXH / BHYT / BHTN when the DB
 * has no matching row), and `getPITBrackets` still returns the raw Prisma
 * rows sorted ascending by `minIncome`.
 */
import { db } from "@/lib/db"
import type { EmployeeInsuranceRates } from "@/lib/payroll/insurance"

// Decimal from Prisma comes as an object with toString()
type Decimal = { toString(): string } | null | undefined
function toNum(d: Decimal): number {
  return d ? Number(d.toString()) : 0
}

/**
 * Load the employee-side insurance rates that are currently in effect for
 * `companyId`. Returns the three rates as a plain-number object, with the
 * hardcoded VN defaults (0.08 / 0.015 / 0.01) filled in for any insurance
 * type the company hasn't configured.
 *
 * These defaults intentionally mirror DEFAULT_INSURANCE_RATES in
 * insurance.ts so a bare new tenant doesn't crash — if you edit them here,
 * edit them there too (and update the payroll-insurance test).
 */
export async function getInsuranceRates(
  companyId: string
): Promise<EmployeeInsuranceRates> {
  const now = new Date()
  const rates = await db.insuranceRate.findMany({
    where: {
      companyId,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gte: now } }],
    },
  })
  const bhxh = rates.find((r: { type: string }) => r.type === "BHXH")
  const bhyt = rates.find((r: { type: string }) => r.type === "BHYT")
  const bhtn = rates.find((r: { type: string }) => r.type === "BHTN")
  return {
    bhxh: toNum((bhxh as { employeeRate?: Decimal } | undefined)?.employeeRate) || 0.08,
    bhyt: toNum((bhyt as { employeeRate?: Decimal } | undefined)?.employeeRate) || 0.015,
    bhtn: toNum((bhtn as { employeeRate?: Decimal } | undefined)?.employeeRate) || 0.01,
  }
}

/**
 * Load the PIT brackets that are currently in effect for `companyId`,
 * sorted ascending by `minIncome`. Returns the raw Prisma rows so callers
 * can pass them straight to `calcPIT(taxableIncome, brackets)` — the
 * bracket records have the minIncome/maxIncome/rate Decimal fields that
 * calcPIT expects.
 *
 * Returns an empty array when the tenant has no brackets configured; the
 * caller is expected to fall back to `calcPITFallback` in that case (see
 * payroll.service.ts `calculatePayroll`).
 */
export async function getPITBrackets(companyId: string) {
  const now = new Date()
  const brackets = await db.pITBracket.findMany({
    where: {
      companyId,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gte: now } }],
    },
    orderBy: { minIncome: "asc" },
  })
  return brackets
}
