/**
 * Shared Excel import/export helpers for the /caidat data-exchange tab.
 *
 * Handles the "matrix sheet" format common to Vietnamese bảng chấm công —
 * rows = employees (keyed by mã NV), columns = days of a month. Output of
 * the importer and input of the exporter both use this same layout so a
 * round-trip preserves the user's existing spreadsheet habits.
 *
 * This file has no DOM access and is safe to import from API routes.
 */
import ExcelJS from "exceljs"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatrixCell = {
  /** Row number in the xlsx (1-indexed, only used for error reporting). */
  rowIdx: number
  /** Employee code from the MÃ NV column — e.g. "NV008". */
  empCode: string
  /** ISO date string YYYY-MM-DD. */
  date: string
  /** Raw cell value — string, number, date, or null. */
  raw: unknown
}

export type ParseResult<T> = {
  sheetName: string
  monthYear: string // "YYYY-MM" detected or provided
  rows: T[]
  errors: Array<{ row: number; col?: number; message: string }>
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export async function readWorkbookFromBuffer(
  buf: ArrayBuffer | Uint8Array
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  // exceljs' .load() wants an ArrayBuffer; accept both for caller convenience.
  const ab: ArrayBuffer =
    buf instanceof ArrayBuffer
      ? buf
      : (buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength
        ) as ArrayBuffer)
  await wb.xlsx.load(ab)
  return wb
}

/**
 * Locate the header row in a bảng chấm công / tăng ca / KPI sheet by scanning
 * the first `maxScan` rows for a cell that contains "MÃ NV" (case- and
 * accent-insensitive). Returns the row number (1-indexed) or -1 if not found.
 */
/**
 * Unwrap exceljs cell values into primitives:
 *   - Formula cells `{ formula, result }` → return the `.result`
 *   - Shared formula cells `{ sharedFormula, result }` → return the `.result`
 *   - Rich-text `{ richText: [{text}, …] }` → concatenated plain text
 *   - Hyperlink / other wrapped objects → return `.text` if available
 *   - Everything else → pass through unchanged
 *
 * Used by header detection AND data cell reading so both see the same
 * "flattened" value regardless of how the source spreadsheet encoded it.
 */
export function unwrapCellValue(v: unknown): unknown {
  if (v == null) return v
  if (v instanceof Date) return v
  if (typeof v !== "object") return v
  const obj = v as Record<string, unknown>
  if ("result" in obj) return unwrapCellValue(obj.result)
  if ("richText" in obj && Array.isArray(obj.richText)) {
    return (obj.richText as Array<{ text: string }>).map(t => t.text).join("")
  }
  if ("text" in obj && typeof obj.text === "string") return obj.text
  return v
}

export function findHeaderRow(ws: ExcelJS.Worksheet, maxScan = 20): number {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim()

  for (let r = 1; r <= Math.min(ws.rowCount, maxScan); r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
      const v = unwrapCellValue(row.getCell(c).value)
      if (typeof v === "string" && normalize(v) === "MA NV") {
        return r
      }
    }
  }
  return -1
}

/**
 * Resolve the empCode / empName / day columns from the header row. The header
 * looks like:
 *   TT │ MÃ NV │ TÊN NV │ CHỨC VỤ │ [date 1] │ [date 2] │ ... │ [date 31]
 *
 * Day columns are any cell in the header row whose value is a Date. We also
 * accept columns where the cell is empty in the header but the cell ONE row
 * below has a day-of-week string (CN/T2/…) — this handles the case where the
 * sheet author merged the date into a single row above.
 */
export function resolveColumnLayout(
  ws: ExcelJS.Worksheet,
  headerRow: number
): {
  empCodeCol: number
  empNameCol: number
  positionCol: number
  dayCols: Array<{ col: number; date: Date }>
} {
  const header = ws.getRow(headerRow)
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim()

  let empCodeCol = -1
  let empNameCol = -1
  let positionCol = -1
  const dayCols: Array<{ col: number; date: Date }> = []

  for (let c = 1; c <= ws.columnCount; c++) {
    const raw = unwrapCellValue(header.getCell(c).value)
    if (typeof raw === "string") {
      const key = norm(raw)
      if (key === "MA NV") empCodeCol = c
      else if (key === "TEN NV" || key === "HO VA TEN") empNameCol = c
      else if (key === "CHUC VU") positionCol = c
    } else if (raw instanceof Date) {
      dayCols.push({ col: c, date: raw })
    }
  }

  return { empCodeCol, empNameCol, positionCol, dayCols }
}

/**
 * Generic matrix-sheet parser. Returns a flat array of (emp, day, rawValue)
 * cells — callers map `raw` into their own domain type (work_units has
 * numeric units + "KL"; overtime has numeric hours; kpi-violations has a
 * boolean/numeric marker).
 */
export function parseMatrixSheet(ws: ExcelJS.Worksheet): {
  headerRow: number
  empCodeCol: number
  dayCols: Array<{ col: number; date: Date }>
  cells: MatrixCell[]
  errors: Array<{ row: number; col?: number; message: string }>
} {
  const errors: Array<{ row: number; col?: number; message: string }> = []
  const headerRow = findHeaderRow(ws)
  if (headerRow < 0) {
    errors.push({ row: 0, message: "Không tìm thấy dòng header 'MÃ NV' trong sheet" })
    return { headerRow: -1, empCodeCol: -1, dayCols: [], cells: [], errors }
  }

  const { empCodeCol, dayCols } = resolveColumnLayout(ws, headerRow)
  if (empCodeCol < 0) {
    errors.push({ row: headerRow, message: "Không có cột MÃ NV ở dòng header" })
    return { headerRow, empCodeCol, dayCols, cells: [], errors }
  }
  if (dayCols.length === 0) {
    errors.push({
      row: headerRow,
      message:
        "Không tìm thấy cột ngày nào ở dòng header (cell phải có định dạng Date)",
    })
    return { headerRow, empCodeCol, dayCols, cells: [], errors }
  }

  const cells: MatrixCell[] = []
  // Employee-code regex — at least 2 alphanumeric characters, no spaces.
  // Filters out the A/B/C/D subheader row (single letters) and the
  // "Người chấm công" / "(Ký, họ tên)" signature block at the bottom of
  // the sheet, which would otherwise sneak through as bogus codes.
  const codeRe = /^[A-Za-z0-9]{2,}$/
  const dataStart = headerRow + 1
  for (let r = dataStart; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const codeVal = unwrapCellValue(row.getCell(empCodeCol).value)
    const codeRaw =
      typeof codeVal === "string"
        ? codeVal.trim()
        : typeof codeVal === "number"
          ? String(codeVal)
          : null
    if (!codeRaw || !codeRe.test(codeRaw)) continue

    for (const { col, date } of dayCols) {
      const v = unwrapCellValue(row.getCell(col).value)
      if (v == null || v === "") continue
      cells.push({
        rowIdx: r,
        empCode: codeRaw,
        date: date.toISOString().slice(0, 10),
        raw: v,
      })
    }
  }

  return { headerRow, empCodeCol, dayCols, cells, errors }
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/**
 * Compute the list of days in a `YYYY-MM` month. Returns an array of
 * `{ day, date, dow }` where `dow` is the Vietnamese short day-of-week label.
 */
export function daysInMonth(monthStr: string): Array<{
  day: number
  date: Date
  dow: string
}> {
  const [y, m] = monthStr.split("-").map(Number)
  const total = new Date(y, m, 0).getDate()
  const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]
  return Array.from({ length: total }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, i + 1))
    return { day: i + 1, date, dow: DOW[date.getUTCDay()] }
  })
}

/**
 * Render the standard company header (4 rows of logo, address, tax code,
 * title) and a month-label row into a worksheet starting at row 1. Returns
 * the next free row index so callers can build the data header below it.
 */
export function writeSheetTitleBlock(
  ws: ExcelJS.Worksheet,
  opts: {
    companyName: string
    title: string
    monthStr: string // YYYY-MM
    subtitleParts?: string[] // optional extra lines shown after title
  }
): number {
  const [y, m] = opts.monthStr.split("-").map(Number)
  ws.getCell("A1").value = opts.companyName
  ws.getCell("A1").font = { bold: true, size: 12 }

  ws.getCell("A2").value = opts.title
  ws.getCell("A2").font = { bold: true, size: 14 }

  ws.getCell("A3").value = `Tháng ${String(m).padStart(2, "0")}/${y}`
  ws.getCell("A3").font = { italic: true }

  let nextRow = 4
  if (opts.subtitleParts) {
    for (const line of opts.subtitleParts) {
      ws.getCell(`A${nextRow}`).value = line
      nextRow++
    }
  }
  return nextRow + 1 // blank separator row
}

/**
 * Write a matrix-sheet header (TT / MÃ NV / TÊN NV / CHỨC VỤ / day columns)
 * starting at `startRow`. Returns the data-row start number.
 *
 * Day columns have the Date object in the top header row and the Vietnamese
 * day-of-week string (CN/T2/…) directly below them — matching the format of
 * the user's existing template.
 */
export function writeMatrixHeader(
  ws: ExcelJS.Worksheet,
  startRow: number,
  days: ReturnType<typeof daysInMonth>
): number {
  const headerRow = ws.getRow(startRow)
  headerRow.getCell(1).value = "TT"
  headerRow.getCell(2).value = "MÃ NV"
  headerRow.getCell(3).value = "TÊN NV"
  headerRow.getCell(4).value = "CHỨC VỤ"
  for (let i = 0; i < days.length; i++) {
    headerRow.getCell(5 + i).value = days[i].date
    headerRow.getCell(5 + i).numFmt = "dd/mm"
  }
  headerRow.getCell(5 + days.length).value = "Tổng"
  headerRow.font = { bold: true }
  headerRow.alignment = { horizontal: "center", vertical: "middle" }

  const dowRow = ws.getRow(startRow + 1)
  for (let i = 0; i < days.length; i++) {
    dowRow.getCell(5 + i).value = days[i].dow
  }
  dowRow.font = { size: 10, italic: true, color: { argb: "FF888888" } }
  dowRow.alignment = { horizontal: "center" }

  // Column widths
  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 8
  ws.getColumn(3).width = 22
  ws.getColumn(4).width = 14
  for (let i = 0; i < days.length; i++) {
    ws.getColumn(5 + i).width = 5
  }
  ws.getColumn(5 + days.length).width = 7

  return startRow + 2 // first data row
}
