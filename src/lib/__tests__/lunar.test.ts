/**
 * Spot-checks for the Vietnamese lunar calendar converter.
 *
 * Reference values are taken from https://amloc.name.vn and
 * https://lichvn.net — both are the canonical web calendars built on
 * Hồ Ngọc Đức's algorithm, same implementation this file ports.
 */
import { describe, it, expect } from "vitest"
import { solarToLunar, getYearCanChi, dowLabelVN } from "@/lib/lunar"

describe("solarToLunar", () => {
  it("converts Tết Ất Tỵ 2025 — 29/1/2025 solar → 1/1/2025 lunar", () => {
    // Tết 2025 (Lunar New Year of year Ất Tỵ) fell on 29 January 2025.
    const r = solarToLunar(29, 1, 2025)
    expect(r).toEqual({ day: 1, month: 1, year: 2025, leap: 0 })
  })

  it("converts Tết Giáp Thìn 2024 — 10/2/2024 solar → 1/1/2024 lunar", () => {
    const r = solarToLunar(10, 2, 2024)
    expect(r).toEqual({ day: 1, month: 1, year: 2024, leap: 0 })
  })

  it("knows that January 2026 solar is still lunar year 2025 (pre-Tết)", () => {
    // Tết Bính Ngọ 2026 = 17/02/2026. 5/1/2026 is still lunar year 2025.
    const r = solarToLunar(5, 1, 2026)
    expect(r.year).toBe(2025)
  })

  it("handles a day inside a leap month correctly", () => {
    // 2023 had nhuận tháng 2 (leap 2nd lunar month). Lunar 1/nhuận-2 fell
    // on 22/3/2023 solar, so 25/3/2023 is lunar 4/nhuận-2 with leap=1.
    const r = solarToLunar(25, 3, 2023)
    expect(r.month).toBe(2)
    expect(r.leap).toBe(1)
  })
})

describe("getYearCanChi", () => {
  it("returns Ất Tỵ for lunar year 2025", () => {
    expect(getYearCanChi(2025)).toBe("Ất Tỵ")
  })

  it("returns Bính Ngọ for lunar year 2026", () => {
    expect(getYearCanChi(2026)).toBe("Bính Ngọ")
  })

  it("returns Giáp Thìn for lunar year 2024", () => {
    expect(getYearCanChi(2024)).toBe("Giáp Thìn")
  })

  it("returns Quý Mão for lunar year 2023", () => {
    expect(getYearCanChi(2023)).toBe("Quý Mão")
  })
})

describe("dowLabelVN", () => {
  it("labels Sunday as Chủ nhật", () => {
    // 2026-04-12 is a Sunday in the Gregorian calendar.
    expect(dowLabelVN(new Date("2026-04-12T12:00:00+07:00"))).toBe("Chủ nhật")
  })

  it("labels Monday as Thứ 2", () => {
    expect(dowLabelVN(new Date("2026-04-13T12:00:00+07:00"))).toBe("Thứ 2")
  })

  it("labels Tuesday as Thứ 3", () => {
    expect(dowLabelVN(new Date("2026-04-14T12:00:00+07:00"))).toBe("Thứ 3")
  })
})
