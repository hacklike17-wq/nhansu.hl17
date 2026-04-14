/**
 * Versioned salary-column loader — Phase 5e extraction from payroll.service.ts.
 *
 * `getColumnsForMonth` returns the salary-column list that was effective
 * for a given payroll month: the live `SalaryColumn` rows, but with each
 * column's `formula` + `name` overridden by the latest
 * `SalaryColumnVersion` whose `effectiveFrom <= monthStart`. This is what
 * makes Phase 08 versioning work — formula changes only affect payrolls
 * recalculated on or after the version's effective date.
 *
 * Pure I/O — no math, no side effects. Extracted verbatim; the merge rule
 * (version wins when present, else live formula wins) is byte-for-byte
 * identical to the previous inline implementation.
 */
import { db } from "@/lib/db"

export async function getColumnsForMonth(companyId: string, month: Date) {
  const monthStart = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1))

  const [liveColumns, versions] = await Promise.all([
    db.salaryColumn.findMany({ where: { companyId }, orderBy: { order: "asc" } }),
    db.salaryColumnVersion.findMany({
      where: { companyId, effectiveFrom: { lte: monthStart } },
      orderBy: { effectiveFrom: "desc" },
    }),
  ])

  // Latest version per columnKey
  const latestPerKey = new Map<string, { columnKey: string; formula: string | null; name: string }>()
  for (const v of versions) {
    if (!latestPerKey.has(v.columnKey)) {
      latestPerKey.set(v.columnKey, v as { columnKey: string; formula: string | null; name: string })
    }
  }

  // Merge: use version formula if available, else live column formula.
  return liveColumns.map((col: { key: string; formula: string | null; name: string }) => {
    const v = latestPerKey.get(col.key)
    if (v) return { ...col, formula: v.formula, name: v.name }
    return col
  })
}
