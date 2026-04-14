/**
 * Phase 0 — safety net tests for src/app/luong/_lib/row-helpers.tsx.
 *
 * buildRowVars is the bridge between the raw Payroll record + salaryValues[]
 * array and the dynamic column rendering in /luong. It decides which source
 * wins (record field > salary value > formula eval > 0) and feeds dependent
 * formulas with earlier results.
 *
 * These tests lock in the current resolution order so the Phase 2 salary
 * column consolidation cannot silently flip priority and shift displayed
 * numbers on the manager table. No DB, no UI — pure function.
 */
import { describe, it, expect } from "vitest"
import { buildRowVars } from "@/app/luong/_lib/row-helpers"

type Col = {
  key: string
  type: "number" | "formula"
  formula?: string | null
}

describe("buildRowVars", () => {
  it("prefers a Payroll record field over salaryValues for system columns", () => {
    const p = {
      baseSalary: 10_000_000,
      salaryValues: [{ columnKey: "luong_co_ban", value: 99 }],
    }
    const cols: Col[] = [{ key: "luong_co_ban", type: "number" }]
    expect(buildRowVars(p, cols).luong_co_ban).toBe(10_000_000)
  })

  it("falls back to salaryValues for custom columns with no record field", () => {
    const p = {
      salaryValues: [{ columnKey: "my_custom_col", value: 1_234_500 }],
    }
    const cols: Col[] = [{ key: "my_custom_col", type: "number" }]
    expect(buildRowVars(p, cols).my_custom_col).toBe(1_234_500)
  })

  it("returns 0 when neither record field nor salaryValues has a value", () => {
    const p = { salaryValues: [] }
    const cols: Col[] = [{ key: "phantom", type: "number" }]
    expect(buildRowVars(p, cols).phantom).toBe(0)
  })

  it("evaluates formula columns using earlier vars", () => {
    const p = {
      baseSalary: 10_000_000,
      responsibilitySalary: 2_000_000,
      salaryValues: [],
    }
    const cols: Col[] = [
      { key: "luong_co_ban", type: "number" },
      { key: "luong_trach_nhiem", type: "number" },
      {
        key: "tong_luong_co_ban",
        type: "formula",
        formula: "luong_co_ban + luong_trach_nhiem",
      },
    ]
    const vars = buildRowVars(p, cols)
    expect(vars.luong_co_ban).toBe(10_000_000)
    expect(vars.luong_trach_nhiem).toBe(2_000_000)
    expect(vars.tong_luong_co_ban).toBe(12_000_000)
  })

  it("uses stored formula-column value when non-zero (does NOT re-eval)", () => {
    // If the service layer already computed + stored a formula result in
    // the record field, buildRowVars must trust that stored value instead
    // of re-running the formula on the fly — this keeps the UI in sync with
    // whatever was persisted.
    const p = {
      workSalary: 7_500_000, // record field wins
      baseSalary: 10_000_000,
      responsibilitySalary: 2_000_000,
      salaryValues: [],
    }
    const cols: Col[] = [
      { key: "luong_co_ban", type: "number" },
      { key: "luong_trach_nhiem", type: "number" },
      {
        key: "tong_luong_co_ban",
        type: "formula",
        formula: "luong_co_ban + luong_trach_nhiem",
      },
    ]
    expect(buildRowVars(p, cols).tong_luong_co_ban).toBe(7_500_000)
  })

  it("handles numeric strings (Prisma Decimal → string) coercion", () => {
    const p = {
      baseSalary: "8500000", // Prisma Decimal often serializes as string
      salaryValues: [],
    }
    const cols: Col[] = [{ key: "luong_co_ban", type: "number" }]
    expect(buildRowVars(p, cols).luong_co_ban).toBe(8_500_000)
  })

  it("never throws on null/undefined record values", () => {
    const p = { baseSalary: null, salaryValues: null as unknown as never[] }
    const cols: Col[] = [{ key: "luong_co_ban", type: "number" }]
    expect(() => buildRowVars(p, cols)).not.toThrow()
    expect(buildRowVars(p, cols).luong_co_ban).toBe(0)
  })
})
