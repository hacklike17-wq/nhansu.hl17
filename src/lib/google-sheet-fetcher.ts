import ExcelJS from "exceljs"
import { readWorkbookFromBuffer } from "./excel-io"

export type SheetTabs = {
  workUnit: ExcelJS.Worksheet | null
  overtime: ExcelJS.Worksheet | null
  kpi: ExcelJS.Worksheet | null
  availableTabs: string[]
}

// Must match the canonical Google Sheets URL format exactly:
//   https://docs.google.com/spreadsheets/d/<ID>/[edit|view|export|...]
// Anchoring with `\b` after ID (followed by /, ?, or end-of-string) rejects
// sneaky prefixes like https://docs.google.com/spreadsheets/d/ID@evil.com/...
// even though the build URL only uses the extracted ID.
const GOOGLE_SHEET_URL_RE =
  /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/

const FETCH_TIMEOUT_MS = 30_000

export class SheetFetchError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = "SheetFetchError"
  }
}

export function extractSheetId(url: string): string | null {
  const m = url.match(GOOGLE_SHEET_URL_RE)
  return m?.[1] ?? null
}

export function isValidSheetUrl(url: string): boolean {
  return extractSheetId(url) !== null
}

function buildXlsxExportUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`
}

/**
 * HEAD request to check if sheet is publicly accessible. Throws SheetFetchError
 * with a specific code that UI can translate to Vietnamese.
 */
export async function validateSheetAccess(url: string): Promise<void> {
  const sheetId = extractSheetId(url)
  if (!sheetId) throw new SheetFetchError("INVALID_URL", "Link không phải Google Sheets")

  const exportUrl = buildXlsxExportUrl(sheetId)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(exportUrl, { method: "HEAD", signal: controller.signal, redirect: "follow" })
    if (res.status === 401 || res.status === 403) {
      throw new SheetFetchError(
        "SHEET_PRIVATE",
        "Sheet đang private — mở Share → Anyone with link can view"
      )
    }
    if (res.status === 404) {
      throw new SheetFetchError("SHEET_NOT_FOUND", "URL không tồn tại")
    }
    if (!res.ok) {
      throw new SheetFetchError("SHEET_FETCH_FAILED", `Google trả về ${res.status}`)
    }
  } catch (e) {
    if (e instanceof SheetFetchError) throw e
    if ((e as Error).name === "AbortError") {
      throw new SheetFetchError("TIMEOUT", "Quá thời gian chờ khi kiểm tra sheet")
    }
    throw new SheetFetchError("SHEET_FETCH_FAILED", `Không kết nối được Google: ${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Full download + parse as xlsx. Returns a workbook object from ExcelJS.
 * Callers use `findTabs` to pick the 3 tabs they need.
 */
export async function fetchSheetWorkbook(url: string): Promise<ExcelJS.Workbook> {
  const sheetId = extractSheetId(url)
  if (!sheetId) throw new SheetFetchError("INVALID_URL", "Link không phải Google Sheets")

  const exportUrl = buildXlsxExportUrl(sheetId)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(exportUrl, { signal: controller.signal, redirect: "follow" })
    if (res.status === 401 || res.status === 403) {
      throw new SheetFetchError("SHEET_PRIVATE", "Sheet đang private — mở Share → Anyone with link can view")
    }
    if (res.status === 404) throw new SheetFetchError("SHEET_NOT_FOUND", "URL không tồn tại")
    if (!res.ok) throw new SheetFetchError("SHEET_FETCH_FAILED", `Google trả về ${res.status}`)

    const buf = await res.arrayBuffer()
    return await readWorkbookFromBuffer(buf)
  } catch (e) {
    if (e instanceof SheetFetchError) throw e
    if ((e as Error).name === "AbortError") {
      throw new SheetFetchError("TIMEOUT", "Quá thời gian chờ khi tải sheet")
    }
    throw new SheetFetchError("SHEET_FETCH_FAILED", `Không tải được sheet: ${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Locate the 3 target tabs by name. Returns null for tabs not found — caller
 * decides whether missing tabs are fatal (Q11 answer: skip with warning).
 *
 * Name matching is case-insensitive and ignores extra whitespace so
 * "BANG CHAM CONG" / "bang cham cong" / "Bang Cham Cong" all match.
 */
export function findTabs(wb: ExcelJS.Workbook): SheetTabs {
  const availableTabs = wb.worksheets.map(w => w.name)
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")
  const byName = new Map(wb.worksheets.map(w => [norm(w.name), w]))

  return {
    workUnit: byName.get(norm("BANG CHAM CONG")) ?? null,
    overtime: byName.get(norm("CC thêm giờ")) ?? null,
    kpi: byName.get(norm("BẢNG THEO DÕI KP CC")) ?? null,
    availableTabs,
  }
}
