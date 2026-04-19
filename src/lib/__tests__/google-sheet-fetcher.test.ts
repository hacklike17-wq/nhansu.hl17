import { describe, it, expect } from "vitest"
import { extractSheetId, isValidSheetUrl } from "../google-sheet-fetcher"

describe("extractSheetId", () => {
  it("extracts id from standard edit URL", () => {
    expect(
      extractSheetId("https://docs.google.com/spreadsheets/d/1K6sXSUsF4i2itWmgBIAaclzL-wg4XDHI/edit?gid=17195196")
    ).toBe("1K6sXSUsF4i2itWmgBIAaclzL-wg4XDHI")
  })

  it("extracts id from share URL", () => {
    expect(
      extractSheetId("https://docs.google.com/spreadsheets/d/ABC_123-xyz/edit?usp=sharing")
    ).toBe("ABC_123-xyz")
  })

  it("returns null for non-docs URL (prevents SSRF)", () => {
    expect(extractSheetId("https://evil.com/spreadsheets/d/foo")).toBeNull()
    expect(extractSheetId("http://docs.google.com/spreadsheets/d/foo")).toBeNull() // http not allowed
    expect(extractSheetId("https://docs.google.com/document/d/foo")).toBeNull()
  })

  it("returns null for garbage input", () => {
    expect(extractSheetId("")).toBeNull()
    expect(extractSheetId("not a url")).toBeNull()
  })
})

describe("isValidSheetUrl", () => {
  it("passes for valid spreadsheet urls", () => {
    expect(
      isValidSheetUrl("https://docs.google.com/spreadsheets/d/abc123/edit")
    ).toBe(true)
  })
  it("rejects non-spreadsheet urls", () => {
    expect(isValidSheetUrl("https://drive.google.com/file/d/abc")).toBe(false)
    expect(isValidSheetUrl("https://google.com")).toBe(false)
  })
})
