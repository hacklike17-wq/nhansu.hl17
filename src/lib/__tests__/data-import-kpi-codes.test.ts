import { describe, it, expect } from "vitest"
import { aoaToWorksheetLike } from "../excel-io"
import { planKpiImport, type ImportCtx } from "../data-import"

/**
 * Regression: kế toán đôi khi viết nhiều mã KPI dồn vào 1 ô không có
 * dấu phân cách (vd "ĐMOL" thay vì "ĐM, OL"). Parser cũ split theo
 * separators rồi check whole-string match → "ĐMOL" rớt vào fallback
 * mặc định "ĐM" → mất "OL".
 */
describe("planKpiImport — concatenated KPI codes", () => {
  const empId = "emp1"
  const empCode = "NV001"
  const ctx: ImportCtx = {
    codeToEmp: new Map([
      [empCode, { id: empId, fullName: "Test", startDate: new Date(Date.UTC(2026, 0, 1)), endDate: null }],
    ]),
    lockedEmpIds: new Set(),
    monthStart: new Date(Date.UTC(2026, 3, 1)),
    monthEnd: new Date(Date.UTC(2026, 3, 30)),
  }

  function runWith(cellValue: unknown) {
    // Sheet shape mirrors real KPI tab: header + DOW row, then employee row
    const apr1 = new Date(Date.UTC(2026, 2, 31, 17, 0, 0)) // VN 01/04
    const aoa: unknown[][] = [
      ["TT", "MÃ NV", "TÊN NV", "CHỨC VỤ", apr1],
      [null, null, null, null, "T4"],
      [1, empCode, "Test", "NV", cellValue],
    ]
    const ws = aoaToWorksheetLike("BANG THEO DOI KP CC", aoa)
    return planKpiImport(ws, ctx)
  }

  it("recognizes both codes when written as 'ĐMOL' (no separator)", () => {
    const plan = runWith("ĐMOL")
    expect(plan.upserts).toHaveLength(1)
    expect(plan.upserts[0].types).toEqual(["ĐM", "OL"])
  })

  it("recognizes 'QCCKL' as QCC + KL (longest match first)", () => {
    const plan = runWith("QCCKL")
    expect(plan.upserts[0].types).toEqual(["QCC", "KL"])
  })

  it("still works for separator-delimited 'ĐM, OL'", () => {
    const plan = runWith("ĐM, OL")
    expect(plan.upserts[0].types).toEqual(["ĐM", "OL"])
  })

  it("still works for whitespace-delimited 'ĐM OL'", () => {
    const plan = runWith("ĐM OL")
    expect(plan.upserts[0].types).toEqual(["ĐM", "OL"])
  })

  it("dedupes when same code appears twice ('ĐMĐM')", () => {
    const plan = runWith("ĐMĐM")
    expect(plan.upserts[0].types).toEqual(["ĐM"])
  })

  it("ignores garbage chars around codes ('xĐM yOL z')", () => {
    const plan = runWith("xĐM yOL z")
    expect(plan.upserts[0].types).toEqual(["ĐM", "OL"])
  })

  it("falls back to ĐM when no valid code found ('xyz')", () => {
    const plan = runWith("xyz")
    expect(plan.upserts[0].types).toEqual(["ĐM"])
  })

  it("single code 'OL' stays single", () => {
    const plan = runWith("OL")
    expect(plan.upserts[0].types).toEqual(["OL"])
  })

  it("triple concat 'ĐMOLNP' → 3 codes", () => {
    const plan = runWith("ĐMOLNP")
    expect(plan.upserts[0].types).toEqual(["ĐM", "OL", "NP"])
  })

  it("skips blank cell — no upsert", () => {
    const plan = runWith("")
    expect(plan.upserts).toHaveLength(0)
  })

  it("skips '0' cell — no upsert", () => {
    const plan = runWith("0")
    expect(plan.upserts).toHaveLength(0)
  })

  // KL2 (nghỉ KL nửa ngày) phải match TRƯỚC KL trong greedy parser,
  // nếu không "KL2" sẽ bị parse thành ["KL"] và mất chữ "2".
  it("recognizes 'KL2' as KL2 (not KL) — longest match wins", () => {
    const plan = runWith("KL2")
    expect(plan.upserts[0].types).toEqual(["KL2"])
  })

  it("recognizes 'KLKL2' as both KL and KL2", () => {
    const plan = runWith("KLKL2")
    expect(plan.upserts[0].types).toEqual(["KL", "KL2"])
  })

  it("recognizes 'VS' (về sớm)", () => {
    const plan = runWith("VS")
    expect(plan.upserts[0].types).toEqual(["VS"])
  })

  it("recognizes 'VSOL' as VS + OL (concatenated)", () => {
    const plan = runWith("VSOL")
    expect(plan.upserts[0].types).toEqual(["VS", "OL"])
  })
})
