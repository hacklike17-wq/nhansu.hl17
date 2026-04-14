/**
 * Shared Excel → domain-row planner for the 3 matrix-sheet importers
 * (work_units / overtime_entries / kpi_violations). Pure functions —
 * no DB writes — so the route layer can run them in dry-run mode and
 * show a preview before committing.
 *
 * Each planner takes a parsed worksheet + the caller's context (employee
 * code→row lookup, month boundaries, the set of payroll-locked employees)
 * and returns an `ImportPlan<T>` with three buckets:
 *   - `upserts`: validated rows ready to write
 *   - `skipped`: rows that are OK but deliberately not written
 *                (employee not in DB, locked payroll, outside contract)
 *   - `errors`:  rows that look wrong enough to abort the whole file
 *                (unparseable cell value, out-of-range number)
 *
 * The route commits only when `errors.length === 0` and the user confirms.
 */
import type ExcelJS from "exceljs"
import { parseMatrixSheet } from "./excel-io"

export type ImportCtx = {
  /** Map of employee `code` → { id, fullName, startDate, endDate } from DB. */
  codeToEmp: Map<
    string,
    { id: string; fullName: string; startDate: Date; endDate: Date | null }
  >
  /** Set of employee IDs whose payroll for the target month is not DRAFT. */
  lockedEmpIds: Set<string>
  /** First day of the target month (UTC 00:00). */
  monthStart: Date
  /** Last day of the target month (UTC 00:00). */
  monthEnd: Date
}

export type SkippedRow = { row: number; reason: string }
export type ErrorRow = { row: number; message: string }

export type ImportPlan<T> = {
  sheetType: "work-units" | "overtime" | "kpi"
  sheetName: string
  upserts: T[]
  skipped: SkippedRow[]
  errors: ErrorRow[]
  /** Count of cells read from the worksheet. */
  cellCount: number
  /** True if dayCols in the sheet cover exactly the requested month. */
  monthMatches: boolean
}

export type WorkUnitRow = {
  employeeId: string
  empName: string
  date: Date
  units: number
  note: string | null
  rowIdx: number
}

export type OvertimeRow = {
  employeeId: string
  empName: string
  date: Date
  hours: number
  note: string | null
  rowIdx: number
}

export type KpiRow = {
  employeeId: string
  empName: string
  date: Date
  types: string[]
  note: string | null
  rowIdx: number
}

// ─── Sheet-type detection ────────────────────────────────────────────────────

/**
 * Detects which import target a sheet should feed into, based on sheet name.
 * Returns null for sheets we don't recognize (they get skipped silently by
 * the unified importer). Accent-insensitive with common spelling variants:
 *
 *   work-units → "chấm công", "CHAM CONG", "Cham cong T3"
 *   overtime   → "tăng ca", "thêm giờ", "Them gio"
 *   kpi        → "KP CC", "KPI", "chuyên cần", "vi phạm"
 */
export function detectSheetType(
  name: string
): "work-units" | "overtime" | "kpi" | null {
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
  if (/cham\s*cong/.test(n)) return "work-units"
  if (/tang\s*ca|them\s*gio/.test(n)) return "overtime"
  // KPI detection is narrower than "kpi" alone to avoid false positives on
  // reference sheets like "KPI3" or "KPI template". Requires one of:
  //   - "kp cc"        — BẢNG THEO DÕI KP CC
  //   - "kpi cc"       — BẢNG KPI CC
  //   - "chuyen can"   — theo dõi chuyên cần
  //   - "vi pham"      — vi phạm KPI
  if (/kpi?\s*cc|chuyen\s*can|vi\s*pham/.test(n)) return "kpi"
  return null
}

// ─── Row-level validator shared by all 3 planners ────────────────────────────

type ValidationOutcome =
  | { kind: "ok"; employeeId: string; empName: string; date: Date }
  | { kind: "skip"; reason: string }
  | { kind: "error"; message: string }

function validateEmpDate(
  empCode: string,
  dateISO: string,
  ctx: ImportCtx
): ValidationOutcome {
  const emp = ctx.codeToEmp.get(empCode)
  if (!emp) {
    return { kind: "skip", reason: `Mã NV "${empCode}" không tồn tại` }
  }
  if (ctx.lockedEmpIds.has(emp.id)) {
    return {
      kind: "skip",
      reason: `${emp.fullName}: bảng lương tháng này đã khoá — bỏ qua`,
    }
  }
  const date = new Date(dateISO + "T00:00:00Z")
  if (date < emp.startDate) {
    return {
      kind: "skip",
      reason: `${emp.fullName}: ngày ${dateISO} trước ngày vào làm`,
    }
  }
  if (emp.endDate && date > emp.endDate) {
    return {
      kind: "skip",
      reason: `${emp.fullName}: ngày ${dateISO} sau ngày kết thúc hợp đồng`,
    }
  }
  return { kind: "ok", employeeId: emp.id, empName: emp.fullName, date }
}

// ─── Planners ────────────────────────────────────────────────────────────────

/**
 * Matrix cell semantics for chấm công:
 *   - numeric 0 / 0.5 / 1 / 1.5 / 2 / ...  → work_unit with units = value
 *   - "KL" (không lương)                    → units = 0, note = "Nghỉ"
 *   - anything else                         → row error (aborts file)
 */
export function planWorkUnitsImport(
  ws: ExcelJS.Worksheet,
  ctx: ImportCtx
): ImportPlan<WorkUnitRow> {
  const parsed = parseMatrixSheet(ws)
  const errors: ErrorRow[] = parsed.errors.map(e => ({
    row: e.row,
    message: e.message,
  }))
  const skipped: SkippedRow[] = []
  const upserts: WorkUnitRow[] = []

  const monthMatches = parsed.dayCols.every(
    dc => dc.date >= ctx.monthStart && dc.date <= ctx.monthEnd
  )

  for (const cell of parsed.cells) {
    const v = validateEmpDate(cell.empCode, cell.date, ctx)
    if (v.kind === "skip") {
      skipped.push({ row: cell.rowIdx, reason: v.reason })
      continue
    }
    if (v.kind === "error") {
      errors.push({ row: cell.rowIdx, message: v.message })
      continue
    }

    const raw = cell.raw
    let units: number
    let note: string | null = null

    if (typeof raw === "number") {
      units = raw
    } else if (typeof raw === "string") {
      const s = raw.trim().toUpperCase()
      if (s === "KL") {
        units = 0
        note = "Nghỉ"
      } else {
        const n = Number(s.replace(",", "."))
        if (Number.isFinite(n)) {
          units = n
        } else {
          errors.push({
            row: cell.rowIdx,
            message: `Giá trị chấm công không hiểu "${raw}" tại ${cell.empCode} ngày ${cell.date}`,
          })
          continue
        }
      }
    } else {
      errors.push({
        row: cell.rowIdx,
        message: `Loại dữ liệu chấm công không hợp lệ tại ${cell.empCode} ngày ${cell.date}`,
      })
      continue
    }

    if (units < 0 || units > 3) {
      errors.push({
        row: cell.rowIdx,
        message: `Số công ${units} ngoài khoảng [0, 3] tại ${cell.empCode} ngày ${cell.date}`,
      })
      continue
    }

    upserts.push({
      employeeId: v.employeeId,
      empName: v.empName,
      date: v.date,
      units,
      note,
      rowIdx: cell.rowIdx,
    })
  }

  return {
    sheetType: "work-units",
    sheetName: ws.name,
    upserts,
    skipped,
    errors,
    cellCount: parsed.cells.length,
    monthMatches,
  }
}

/**
 * Matrix cell semantics for tăng ca:
 *   - numeric 0 / 0.5 / 1 / ... / 12  → overtime hours
 *   - blank                            → no row (already filtered by parser)
 *   - anything else                    → row error
 */
export function planOvertimeImport(
  ws: ExcelJS.Worksheet,
  ctx: ImportCtx
): ImportPlan<OvertimeRow> {
  const parsed = parseMatrixSheet(ws)
  const errors: ErrorRow[] = parsed.errors.map(e => ({
    row: e.row,
    message: e.message,
  }))
  const skipped: SkippedRow[] = []
  const upserts: OvertimeRow[] = []

  const monthMatches = parsed.dayCols.every(
    dc => dc.date >= ctx.monthStart && dc.date <= ctx.monthEnd
  )

  for (const cell of parsed.cells) {
    const v = validateEmpDate(cell.empCode, cell.date, ctx)
    if (v.kind === "skip") {
      skipped.push({ row: cell.rowIdx, reason: v.reason })
      continue
    }
    if (v.kind === "error") {
      errors.push({ row: cell.rowIdx, message: v.message })
      continue
    }

    const raw = cell.raw
    let hours: number
    if (typeof raw === "number") {
      hours = raw
    } else if (typeof raw === "string") {
      const s = raw.trim().replace(",", ".")
      const n = Number(s)
      if (!Number.isFinite(n)) {
        errors.push({
          row: cell.rowIdx,
          message: `Giờ tăng ca không hiểu "${raw}" tại ${cell.empCode} ngày ${cell.date}`,
        })
        continue
      }
      hours = n
    } else {
      errors.push({
        row: cell.rowIdx,
        message: `Loại dữ liệu tăng ca không hợp lệ tại ${cell.empCode} ngày ${cell.date}`,
      })
      continue
    }

    if (hours < 0 || hours > 12) {
      errors.push({
        row: cell.rowIdx,
        message: `Giờ tăng ca ${hours} ngoài khoảng [0, 12] tại ${cell.empCode} ngày ${cell.date}`,
      })
      continue
    }

    // 0 hours is a valid "explicit no-overtime" marker from the spreadsheet
    // (user typed 0). Skip to keep DB clean — equivalent to blank.
    if (hours === 0) continue

    upserts.push({
      employeeId: v.employeeId,
      empName: v.empName,
      date: v.date,
      hours,
      note: null,
      rowIdx: cell.rowIdx,
    })
  }

  return {
    sheetType: "overtime",
    sheetName: ws.name,
    upserts,
    skipped,
    errors,
    cellCount: parsed.cells.length,
    monthMatches,
  }
}

/**
 * Matrix cell semantics for KPI vi phạm:
 *   - Any truthy value (number ≥ 1, "1", "x", "X", "✓") → create violation
 *     with types = ["DM"] (default per user decision).
 *   - Blank → no row.
 *   - 0 or "0" → skip (explicit "no violation" marker).
 *   - Multi-code strings like "DM,NS" → parse as array of known codes.
 */
export function planKpiImport(
  ws: ExcelJS.Worksheet,
  ctx: ImportCtx
): ImportPlan<KpiRow> {
  const parsed = parseMatrixSheet(ws)
  const errors: ErrorRow[] = parsed.errors.map(e => ({
    row: e.row,
    message: e.message,
  }))
  const skipped: SkippedRow[] = []
  const upserts: KpiRow[] = []

  const monthMatches = parsed.dayCols.every(
    dc => dc.date >= ctx.monthStart && dc.date <= ctx.monthEnd
  )

  const VALID_CODES = new Set(["DM", "NP", "NS", "KL", "QC"])

  for (const cell of parsed.cells) {
    const v = validateEmpDate(cell.empCode, cell.date, ctx)
    if (v.kind === "skip") {
      skipped.push({ row: cell.rowIdx, reason: v.reason })
      continue
    }
    if (v.kind === "error") {
      errors.push({ row: cell.rowIdx, message: v.message })
      continue
    }

    const raw = cell.raw
    let types: string[] = []

    if (typeof raw === "number") {
      if (raw === 0) continue
      types = ["DM"]
    } else if (typeof raw === "string") {
      const s = raw.trim().toUpperCase()
      if (!s || s === "0") continue
      // If the string contains valid KPI codes → split
      const parts = s
        .split(/[,;\s/]+/)
        .map(x => x.trim())
        .filter(Boolean)
      const recognized = parts.filter(p => VALID_CODES.has(p))
      if (recognized.length > 0) {
        types = recognized
      } else {
        // Any other non-empty marker ("x", "1", "✓", "v"…) → default DM
        types = ["DM"]
      }
    } else {
      errors.push({
        row: cell.rowIdx,
        message: `Loại dữ liệu KPI không hợp lệ tại ${cell.empCode} ngày ${cell.date}`,
      })
      continue
    }

    upserts.push({
      employeeId: v.employeeId,
      empName: v.empName,
      date: v.date,
      types,
      note: null,
      rowIdx: cell.rowIdx,
    })
  }

  return {
    sheetType: "kpi",
    sheetName: ws.name,
    upserts,
    skipped,
    errors,
    cellCount: parsed.cells.length,
    monthMatches,
  }
}
