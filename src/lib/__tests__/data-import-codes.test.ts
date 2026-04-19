import { describe, it, expect } from "vitest"
import { WORK_UNIT_CODE_MAP } from "../data-import"

describe("WORK_UNIT_CODE_MAP — aligned with Google Sheet (Apr 2026)", () => {
  it("ĐM = 1 công (đi muộn vẫn tính công)", () => {
    expect(WORK_UNIT_CODE_MAP["ĐM"]).toEqual({ units: 1, note: "Đi muộn" })
  })

  it("NP = 0 công (nghỉ phép công ty mất công)", () => {
    expect(WORK_UNIT_CODE_MAP.NP).toEqual({ units: 0, note: "Nghỉ phép" })
  })

  it("KL = 0 công với note rõ", () => {
    expect(WORK_UNIT_CODE_MAP.KL).toEqual({ units: 0, note: "Nghỉ không lương" })
  })

  it("LT = 1 công (lễ tết vẫn hưởng lương)", () => {
    expect(WORK_UNIT_CODE_MAP.LT).toEqual({ units: 1, note: "Nghỉ Lễ tết" })
  })

  it("TS = 1 công (thai sản vẫn tính công, BHXH trả lương)", () => {
    expect(WORK_UNIT_CODE_MAP.TS).toEqual({ units: 1, note: "Nghỉ thai sản" })
  })

  it("QCC = 1 công (quên chấm công vẫn tính)", () => {
    expect(WORK_UNIT_CODE_MAP.QCC).toEqual({ units: 1, note: "Quên chấm công" })
  })

  it("không còn các code cũ DM / QC / NS", () => {
    expect(WORK_UNIT_CODE_MAP.DM).toBeUndefined()
    expect(WORK_UNIT_CODE_MAP.QC).toBeUndefined()
    expect(WORK_UNIT_CODE_MAP.NS).toBeUndefined()
  })

  it("chỉ có đúng 6 code", () => {
    expect(Object.keys(WORK_UNIT_CODE_MAP).sort()).toEqual(
      ["KL", "LT", "NP", "QCC", "TS", "ĐM"].sort()
    )
  })
})
