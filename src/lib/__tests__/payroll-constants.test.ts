/**
 * Phase 0 — safety net tests for shared payroll constants and helpers.
 *
 * Purpose: lock in the *current* shape of our status maps and salary column
 * mappings so the Phase 1/2 consolidation can't silently drop an entry or
 * rename a canonical key. These tests are expected to stay green across the
 * entire refactor; if they fail, a consumer is almost certainly broken.
 *
 * Scope is read-only and purely structural — no DB, no formula math, no UI.
 * The formula engine itself is covered by src/lib/__tests__/formula.test.ts.
 */
import { describe, it, expect } from "vitest"
import { STATUS_MAP, COL_FIELD, MANUAL_INPUT_MAP } from "@/app/luong/_lib/constants"
import { ENTRY_ALLOWED_COLUMNS } from "@/lib/schemas/payroll"
import type { KpiViolationType } from "@/types"
import { PayrollStatus } from "@/generated/prisma/enums"

describe("payroll STATUS_MAP", () => {
  const EXPECTED_STATUSES = ["DRAFT", "PENDING", "APPROVED", "LOCKED", "PAID"] as const

  it("contains an entry for every Prisma PayrollStatus value", () => {
    for (const s of Object.values(PayrollStatus)) {
      expect(STATUS_MAP[s], `missing STATUS_MAP entry for "${s}"`).toBeDefined()
    }
  })

  it("has exactly the 5 known statuses", () => {
    const keys = Object.keys(STATUS_MAP).sort()
    expect(keys).toEqual([...EXPECTED_STATUSES].sort())
  })

  it("each entry has a non-empty label and tailwind class", () => {
    for (const s of EXPECTED_STATUSES) {
      expect(STATUS_MAP[s].label.length).toBeGreaterThan(0)
      expect(STATUS_MAP[s].cls).toMatch(/\b(bg|text)-/)
    }
  })
})

describe("COL_FIELD (salary column → Payroll record field)", () => {
  // Canonical mappings from the current implementation. If any of these
  // changes during Phase 2 consolidation, test must be updated deliberately
  // (and the corresponding view code re-checked).
  const EXPECTED: Record<string, string> = {
    luong_co_ban: "baseSalary",
    luong_trach_nhiem: "responsibilitySalary",
    tong_luong_co_ban: "workSalary",
    cong_so: "netWorkUnits",
    gio_tang_ca: "overtimeHours",
    tien_tang_ca: "overtimePay",
    kpi_chuyen_can: "kpiChuyenCan",
    tien_an: "mealPay",
    tien_phu_cap: "tienPhuCap",
    tien_tru_khac: "tienPhat",
    tong_thuc_nhan: "netSalary",
  }

  it("matches the canonical key → field map", () => {
    expect(COL_FIELD).toEqual(EXPECTED)
  })

  it("tien_tru_khac still resolves to the legacy tienPhat field", () => {
    // This alias is load-bearing — the DB column is tienPhat but the UI
    // shows it as "Trừ khác". Phase 2 must preserve the alias.
    expect(COL_FIELD.tien_tru_khac).toBe("tienPhat")
  })
})

describe("MANUAL_INPUT_MAP (editable cell save keys)", () => {
  const EXPECTED: Record<string, string> = {
    tien_phu_cap: "tien_phu_cap",
    thuong: "thuong",
    tien_tru_khac: "tien_tru_khac",
    kpi_chuyen_can: "kpi_chuyen_can",
  }

  it("lists exactly the 4 manual-input columns", () => {
    expect(MANUAL_INPUT_MAP).toEqual(EXPECTED)
  })
})

describe("ENTRY_ALLOWED_COLUMNS (line-item breakdown whitelist)", () => {
  it("exposes only the 2 columns that support entries", () => {
    expect([...ENTRY_ALLOWED_COLUMNS].sort()).toEqual(
      ["tien_phu_cap", "tien_tru_khac"].sort()
    )
  })

  it("every entry-allowed column must also be a manual-input column", () => {
    for (const k of ENTRY_ALLOWED_COLUMNS) {
      expect(
        MANUAL_INPUT_MAP[k],
        `ENTRY_ALLOWED_COLUMNS has "${k}" but it's not in MANUAL_INPUT_MAP`
      ).toBeDefined()
    }
  })
})

describe("KpiViolationType", () => {
  it("has all 6 KPI codes at the type level", () => {
    // Compile-time check — if the type shrinks, this will fail tsc.
    const codes: KpiViolationType[] = ["ĐM", "NP", "KL", "LT", "QCC", "OL"]
    expect(codes).toHaveLength(6)
  })
})
