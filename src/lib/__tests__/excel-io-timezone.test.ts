import { describe, it, expect } from "vitest"
import { aoaToWorksheetLike, parseMatrixSheet } from "../excel-io"

/**
 * Regression: Google Sheets exports DATE cells as midnight in the
 * spreadsheet's locale (Asia/Ho_Chi_Minh = UTC+7). User-visible 01/04/2026
 * lands as 2026-03-31T17:00:00.000Z. The old `getUTCDate()` returned 31 for
 * VN day 1 — every column was off by one, and VN day 1 was dropped entirely
 * (31 > daysInMonth). Confirmed against production sheet 26/04 where Giang
 * 04/04 became 0.5 (Sun 05/04's value) instead of 0.75.
 */
describe("excel-io — VN-timezone date columns from Google Sheets export", () => {
  // Build a minimal 4-employee × 3-day worksheet whose header dates use the
  // VN-midnight-stored-as-UTC convention real exports produce.
  const vnApr1 = new Date(Date.UTC(2026, 2, 31, 17, 0, 0)) // VN 01/04/2026
  const vnApr2 = new Date(Date.UTC(2026, 3, 1, 17, 0, 0))  // VN 02/04/2026
  const vnApr3 = new Date(Date.UTC(2026, 3, 2, 17, 0, 0))  // VN 03/04/2026

  const aoa: unknown[][] = [
    ["TT", "MÃ NV", "TÊN NV", "CHỨC VỤ", vnApr1, vnApr2, vnApr3],
    [null, null,    null,     null,       "T4",   "T5",   "T6"],
    [1,    "NV001", "Test A", "NV",       1,      0.5,    "KL"],
  ]
  const ws = aoaToWorksheetLike("BANG CHAM CONG", aoa)
  const parsed = parseMatrixSheet(ws, { year: 2026, month: 4 })

  it("maps VN-midnight Date to the VN wall-clock day, not the UTC day", () => {
    const days = parsed.dayCols.map(d => ({
      iso: d.date.toISOString().slice(0, 10),
    }))
    expect(days).toEqual([
      { iso: "2026-04-01" },
      { iso: "2026-04-02" },
      { iso: "2026-04-03" },
    ])
  })

  it("does NOT drop VN day 1 (regression — getUTCDate returned 31)", () => {
    const day1 = parsed.dayCols.find(
      d => d.date.toISOString().slice(0, 10) === "2026-04-01"
    )
    expect(day1).toBeDefined()
  })

  it("emits cells against VN dates so DB rows align with the user's calendar", () => {
    const cellsForA = parsed.cells.filter(c => c.empCode === "NV001")
    expect(cellsForA).toEqual([
      { rowIdx: 3, empCode: "NV001", date: "2026-04-01", raw: 1 },
      { rowIdx: 3, empCode: "NV001", date: "2026-04-02", raw: 0.5 },
      { rowIdx: 3, empCode: "NV001", date: "2026-04-03", raw: "KL" },
    ])
  })
})
