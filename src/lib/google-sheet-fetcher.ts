import ExcelJS from "exceljs"
import * as XLSX from "xlsx"
import {
  readWorkbookFromBuffer,
  aoaToWorksheetLike,
  type WorksheetLike,
} from "./excel-io"

export type SheetTabs = {
  workUnit: ExcelJS.Worksheet | null
  overtime: ExcelJS.Worksheet | null
  kpi: ExcelJS.Worksheet | null
  availableTabs: string[]
}

/**
 * Lightweight version of SheetTabs used by the memory-sensitive sync path:
 * the underlying xlsx is parsed with SheetJS instead of ExcelJS, producing
 * ~5× less heap pressure per cell. Planners accept `WorksheetLike` so the
 * two paths share all downstream logic.
 */
export type CompactSheetTabs = {
  workUnit: WorksheetLike | null
  overtime: WorksheetLike | null
  kpi: WorksheetLike | null
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

/**
 * Download + parse sheet XLSX using SheetJS (xlsx) instead of ExcelJS,
 * then return just the 3 target tabs as `WorksheetLike` array-of-arrays.
 *
 * Why: ExcelJS builds a full cell-tree with style/formula metadata (roughly
 * 30-50× the raw xlsx size) and keeps the whole workbook alive even when we
 * only read 3 tabs. SheetJS stores a flat `{v, t}` dict and `sheet_to_json`
 * gives us a compact 2D array. Measured to drop parse-phase peak heap from
 * ~400MB to ~80MB on a month-sized HR sheet.
 *
 * Caller gets `null` for any tab not present; `availableTabs` lists every
 * tab in the workbook so a missing-tab error can name the wrong-spelling.
 */
export async function fetchSheetTabsCompact(url: string): Promise<CompactSheetTabs> {
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

    const buf = Buffer.from(await res.arrayBuffer())
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

    // Parse with SheetJS — `cellDates:true` returns JS Date objects for date
    // cells; `cellFormula:false` drops formula source (we only need values).
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellFormula: false, cellStyles: false })
    const availableTabs = wb.SheetNames
    const byName = new Map(wb.SheetNames.map(n => [norm(n), n]))

    function extractTab(canonicalName: string): WorksheetLike | null {
      const key = byName.get(norm(canonicalName))
      if (!key) return null
      const sheet = wb.Sheets[key]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: true,
      })
      return aoaToWorksheetLike(key, aoa)
    }

    return {
      workUnit: extractTab("BANG CHAM CONG"),
      overtime: extractTab("CC thêm giờ"),
      kpi: extractTab("BẢNG THEO DÕI KP CC"),
      availableTabs,
    }
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
