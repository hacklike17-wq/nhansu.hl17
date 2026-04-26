/**
 * sheet-sync.service.ts — core logic to pull WorkUnit / OvertimeEntry /
 * KpiViolation from a Google Sheet XLSX export into the DB.
 *
 * Design notes (from the RFC):
 *  Q1 (conflict):  rows with `source = "MANUAL"` or a non-null note are
 *                  preserved (counted in `preservedNotes`). Every other case
 *                  upserts. Applies to all 3 tables (work_units, overtime,
 *                  kpi) — any cell a human edited stays put even if the user
 *                  forgot to add a note.
 *  Q2 (lock):      employees whose payroll for the target month is not DRAFT
 *                  are skipped entirely (counted in `skippedLocked`).
 *  Q3 (empty):     blank cells in the sheet produce no DB mutation (parser
 *                  already filters these out upstream).
 *  Q10 (month):    `monthMatches` from parser must be true, else we bail
 *                  with MONTH_MISMATCH.
 *  Q11 (missing):  each of the 3 tabs is optional — missing = warning only.
 *  Q15 (concurrent): advisory lock per companyId prevents parallel runs.
 *
 * Memory strategy (Tier 2, 2026-04-24):
 *  - Parse phase runs inside an IIFE scope so the ExcelJS workbook + tabs
 *    go out of scope before DB writes; V8 can reclaim ~hundreds of MB of
 *    cell/style metadata while the slow per-row network IO is happening.
 *  - DB writes are batched: one createMany + one chunked $transaction per
 *    tab instead of N sequential awaits. Cuts Prisma allocation pressure
 *    and shrinks the end-to-end duration window during which a concurrent
 *    cron tick could pile on.
 */
import { db } from "@/lib/db"
import { lockedEmployeeIdsForMonth } from "@/lib/chamcong-guard"
import { recalculateMonth } from "@/lib/services/payroll.service"
import {
  fetchSheetTabsCompact,
  SheetFetchError,
} from "@/lib/google-sheet-fetcher"
import {
  planWorkUnitsImport,
  planOvertimeImport,
  planKpiImport,
  type ImportCtx,
  type ImportPlan,
  type WorkUnitRow,
  type OvertimeRow,
  type KpiRow,
} from "@/lib/data-import"

export type SyncRowsAffected = {
  workUnit: number
  overtime: number
  kpi: number
  /** Rows that could NOT be written because the employee is not in the DB. */
  skippedEmps: number
  /** Rows skipped because the employee's payroll is locked for this month. */
  skippedLocked: number
  /**
   * Rows preserved because the existing row was either manually edited
   * (`source === "MANUAL"`) or has a manager's note. Field name kept for
   * backwards compatibility with `sheet_sync_logs.rowsAffected` history.
   */
  preservedNotes: number
  /**
   * Peak heapUsed (MB) seen during the sync. Added 2026-04-24 after the
   * cron OOM incident — lets us watch for regressions without rolling a new
   * deploy just to add logs.
   */
  heapPeakMB?: number
}

function logHeap(stage: string, companyId: string, peakRef: { v: number }): void {
  const m = process.memoryUsage()
  const heapMB = Math.round(m.heapUsed / 1024 / 1024)
  const rssMB = Math.round(m.rss / 1024 / 1024)
  if (heapMB > peakRef.v) peakRef.v = heapMB
  console.log(`[sheet-sync] ${companyId} ${stage} heap=${heapMB}MB rss=${rssMB}MB`)
}

export type SyncResult = {
  status: "ok"
  durationMs: number
  rowsAffected: SyncRowsAffected
  warnings: string[]
}

export class SyncError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = "SyncError"
  }
}

/** Parse "YYYY-MM" into {monthStart, monthEnd} UTC boundaries. */
function monthBoundaries(sheetMonth: string): { monthStart: Date; monthEnd: Date } {
  const m = sheetMonth.match(/^(\d{4})-(\d{2})$/)
  if (!m) throw new SyncError("INVALID_MONTH", "Tháng phải định dạng YYYY-MM")
  const year = Number(m[1])
  const month = Number(m[2]) // 1-indexed
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(year, month, 0))
  return { monthStart, monthEnd }
}

/**
 * Postgres advisory-lock helper. Uses two int4 keys derived from companyId so
 * concurrent sync calls for the same company block each other, while other
 * companies sync in parallel. We use the two-arg form pg_try_advisory_lock(int, int)
 * so we can stay within JS safe-integer range (no BigInt needed).
 */
function companyLockKey(companyId: string): { k1: number; k2: number } {
  let h1 = 0
  let h2 = 5381
  for (let i = 0; i < companyId.length; i++) {
    const c = companyId.charCodeAt(i)
    h1 = ((h1 * 31) ^ c) | 0
    h2 = ((h2 * 33) ^ c) | 0
  }
  return { k1: h1, k2: h2 }
}

async function tryAdvisoryLock(key: { k1: number; k2: number }): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ pg_try_advisory_lock: boolean }>>(
    `SELECT pg_try_advisory_lock($1::int, $2::int)`,
    key.k1,
    key.k2
  )
  return rows[0]?.pg_try_advisory_lock === true
}

async function releaseAdvisoryLock(key: { k1: number; k2: number }): Promise<void> {
  await db.$queryRawUnsafe(
    `SELECT pg_advisory_unlock($1::int, $2::int)`,
    key.k1,
    key.k2
  )
}

const UPDATE_CHUNK_SIZE = 100

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Validate monthMatches + errors on a plan, or throw SyncError. */
function assertPlanValid<T>(plan: ImportPlan<T>, sheetName: string, sheetMonth: string): void {
  if (!plan.monthMatches) {
    throw new SyncError(
      "MONTH_MISMATCH",
      `Tab '${sheetName}' chứa ngày không thuộc tháng ${sheetMonth}`
    )
  }
  if (plan.errors.length > 0) {
    throw new SyncError(
      "PARSE_ERROR",
      `Tab '${sheetName}' có lỗi: ${plan.errors[0].message}`
    )
  }
}

/**
 * Batch-write WorkUnits: fetches existing rows for the month in one query,
 * partitions `plan.upserts` into preserve / update / create buckets, then
 * executes one `createMany` + one chunked `$transaction` of updates.
 */
async function writeWorkUnits(params: {
  companyId: string
  syncedBy: string
  plan: ImportPlan<WorkUnitRow>
  monthStart: Date
  monthEnd: Date
  rowsAffected: SyncRowsAffected
}): Promise<void> {
  const { companyId, syncedBy, plan, monthStart, monthEnd, rowsAffected } = params

  // Count skipped from parser reasons regardless of write outcome.
  for (const s of plan.skipped) {
    if (s.reason.includes("không tồn tại")) rowsAffected.skippedEmps++
    else if (s.reason.includes("bảng lương")) rowsAffected.skippedLocked++
  }

  if (plan.upserts.length === 0) return

  const existing = await db.workUnit.findMany({
    where: {
      companyId,
      employeeId: { in: plan.upserts.map(u => u.employeeId) },
      date: { gte: monthStart, lte: monthEnd },
    },
    select: { id: true, employeeId: true, date: true, note: true, source: true },
  })
  const existingByKey = new Map(
    existing.map(e => [`${e.employeeId}|${isoDate(e.date as Date)}`, e])
  )

  const creates: Array<{
    companyId: string
    employeeId: string
    date: Date
    units: number
    note: string | null
    source: string
    sourceBy: string
  }> = []
  const updates: Array<{ id: string; units: number; note: string | null }> = []

  for (const row of plan.upserts) {
    const key = `${row.employeeId}|${isoDate(row.date)}`
    const ex = existingByKey.get(key)
    if (ex?.source === "MANUAL" || ex?.note) {
      rowsAffected.preservedNotes++
      continue
    }
    if (ex) {
      updates.push({ id: ex.id, units: row.units, note: row.note })
    } else {
      creates.push({
        companyId,
        employeeId: row.employeeId,
        date: row.date,
        units: row.units,
        note: row.note,
        source: "SHEET_SYNC",
        sourceBy: syncedBy,
      })
    }
    rowsAffected.workUnit++
  }

  if (creates.length > 0) {
    await db.workUnit.createMany({ data: creates })
  }
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE)
    await db.$transaction(
      chunk.map(u =>
        db.workUnit.update({
          where: { id: u.id },
          data: {
            units: u.units,
            note: u.note,
            source: "SHEET_SYNC",
            sourceBy: syncedBy,
          },
        })
      )
    )
  }
}

/** Batch-write OvertimeEntry — no unique constraint, so partition by a
 *  pre-fetched existing-rows map and split into createMany + update chunks. */
async function writeOvertime(params: {
  companyId: string
  syncedBy: string
  plan: ImportPlan<OvertimeRow>
  monthStart: Date
  monthEnd: Date
  rowsAffected: SyncRowsAffected
}): Promise<void> {
  const { companyId, syncedBy, plan, monthStart, monthEnd, rowsAffected } = params
  if (plan.upserts.length === 0) return

  const existing = await db.overtimeEntry.findMany({
    where: {
      companyId,
      employeeId: { in: plan.upserts.map(u => u.employeeId) },
      date: { gte: monthStart, lte: monthEnd },
    },
    select: { id: true, employeeId: true, date: true, note: true, source: true },
  })
  const existingByKey = new Map(
    existing.map(e => [`${e.employeeId}|${isoDate(e.date as Date)}`, e])
  )

  const creates: Array<{
    companyId: string
    employeeId: string
    date: Date
    hours: number
    note: string | null
    source: string
    sourceBy: string
  }> = []
  const updates: Array<{ id: string; hours: number; note: string | null }> = []

  for (const row of plan.upserts) {
    const ex = existingByKey.get(`${row.employeeId}|${isoDate(row.date)}`)
    if (ex?.source === "MANUAL" || ex?.note) {
      rowsAffected.preservedNotes++
      continue
    }
    if (ex) {
      updates.push({ id: ex.id, hours: row.hours, note: row.note })
    } else {
      creates.push({
        companyId,
        employeeId: row.employeeId,
        date: row.date,
        hours: row.hours,
        note: row.note,
        source: "SHEET_SYNC",
        sourceBy: syncedBy,
      })
    }
    rowsAffected.overtime++
  }

  if (creates.length > 0) {
    await db.overtimeEntry.createMany({ data: creates })
  }
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE)
    await db.$transaction(
      chunk.map(u =>
        db.overtimeEntry.update({
          where: { id: u.id },
          data: {
            hours: u.hours,
            note: u.note,
            source: "SHEET_SYNC",
            sourceBy: syncedBy,
          },
        })
      )
    )
  }
}

/** Batch-write KpiViolation — same pattern as overtime. */
async function writeKpi(params: {
  companyId: string
  syncedBy: string
  plan: ImportPlan<KpiRow>
  monthStart: Date
  monthEnd: Date
  rowsAffected: SyncRowsAffected
}): Promise<void> {
  const { companyId, syncedBy, plan, monthStart, monthEnd, rowsAffected } = params
  if (plan.upserts.length === 0) return

  const existing = await db.kpiViolation.findMany({
    where: {
      companyId,
      employeeId: { in: plan.upserts.map(u => u.employeeId) },
      date: { gte: monthStart, lte: monthEnd },
    },
    select: { id: true, employeeId: true, date: true, note: true, source: true },
  })
  const existingByKey = new Map(
    existing.map(e => [`${e.employeeId}|${isoDate(e.date as Date)}`, e])
  )

  const creates: Array<{
    companyId: string
    employeeId: string
    date: Date
    types: string[]
    note: string | null
    source: string
    sourceBy: string
  }> = []
  const updates: Array<{ id: string; types: string[]; note: string | null }> = []

  for (const row of plan.upserts) {
    const ex = existingByKey.get(`${row.employeeId}|${isoDate(row.date)}`)
    if (ex?.source === "MANUAL" || ex?.note) {
      rowsAffected.preservedNotes++
      continue
    }
    if (ex) {
      updates.push({ id: ex.id, types: row.types, note: row.note })
    } else {
      creates.push({
        companyId,
        employeeId: row.employeeId,
        date: row.date,
        types: row.types,
        note: row.note,
        source: "SHEET_SYNC",
        sourceBy: syncedBy,
      })
    }
    rowsAffected.kpi++
  }

  if (creates.length > 0) {
    await db.kpiViolation.createMany({ data: creates })
  }
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE)
    await db.$transaction(
      chunk.map(u =>
        db.kpiViolation.update({
          where: { id: u.id },
          data: {
            types: u.types,
            note: u.note,
            source: "SHEET_SYNC",
            sourceBy: syncedBy,
          },
        })
      )
    )
  }
}

/**
 * Run the full sync for one company. Caller should have already loaded
 * CompanySettings and confirmed `sheetSyncEnabled / sheetUrl / sheetMonth`
 * are populated.
 *
 * Every outcome is written to `sheet_sync_logs` before the function returns,
 * so a crashing caller still leaves a trail.
 */
export async function syncSheetForCompany(params: {
  companyId: string
  sheetUrl: string
  sheetMonth: string
  syncedBy: string
}): Promise<SyncResult> {
  const { companyId, sheetUrl, sheetMonth, syncedBy } = params
  const startTime = Date.now()
  const lockKey = companyLockKey(companyId)
  const heapPeak = { v: 0 }

  const gotLock = await tryAdvisoryLock(lockKey)
  if (!gotLock) {
    throw new SyncError(
      "SYNC_IN_PROGRESS",
      "Đang có sync khác chạy, thử lại sau 30s"
    )
  }

  const rowsAffected: SyncRowsAffected = {
    workUnit: 0,
    overtime: 0,
    kpi: 0,
    skippedEmps: 0,
    skippedLocked: 0,
    preservedNotes: 0,
  }
  const warnings: string[] = []

  try {
    logHeap("start", companyId, heapPeak)
    const { monthStart, monthEnd } = monthBoundaries(sheetMonth)

    // --- Build shared import context ---
    const employees = await db.employee.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, code: true, fullName: true, startDate: true, endDate: true },
    })
    const codeToEmp = new Map(
      employees
        .filter(e => e.code)
        .map(e => [
          e.code!,
          { id: e.id, fullName: e.fullName, startDate: e.startDate, endDate: e.endDate },
        ])
    )
    const lockedEmpIds = await lockedEmployeeIdsForMonth(
      companyId,
      monthStart,
      employees.map(e => e.id)
    )
    const ctx: ImportCtx = { codeToEmp, lockedEmpIds, monthStart, monthEnd }
    logHeap("after-ctx-loaded", companyId, heapPeak)

    // --- Parse phase (scoped IIFE so SheetJS workbook + AoA tabs are
    // eligible for GC before the slow per-tab DB writes start) ---
    const { workUnitPlan, overtimePlan, kpiPlan } = await (async () => {
      const tabs = await fetchSheetTabsCompact(sheetUrl)
      logHeap("after-fetch", companyId, heapPeak)

      if (!tabs.workUnit && !tabs.overtime && !tabs.kpi) {
        throw new SyncError(
          "NO_TABS_FOUND",
          `Không tìm thấy tab nào cần đồng bộ. Các tab có trong sheet: ${tabs.availableTabs.join(", ")}`
        )
      }

      const workUnitPlan = tabs.workUnit
        ? { plan: planWorkUnitsImport(tabs.workUnit, ctx), name: tabs.workUnit.name }
        : null
      const overtimePlan = tabs.overtime
        ? { plan: planOvertimeImport(tabs.overtime, ctx), name: tabs.overtime.name }
        : null
      const kpiPlan = tabs.kpi
        ? { plan: planKpiImport(tabs.kpi, ctx), name: tabs.kpi.name }
        : null
      logHeap("after-parse", companyId, heapPeak)

      return { workUnitPlan, overtimePlan, kpiPlan }
    })()
    // tabs + AoA refs are out of scope now; next major GC cycle can reclaim
    // them while we're waiting on DB IO below.
    logHeap("after-release", companyId, heapPeak)

    // --- Validate all plans before touching the DB ---
    if (workUnitPlan) assertPlanValid(workUnitPlan.plan, workUnitPlan.name, sheetMonth)
    else warnings.push("Tab 'BANG CHAM CONG' không tìm thấy")

    if (overtimePlan) assertPlanValid(overtimePlan.plan, overtimePlan.name, sheetMonth)
    else warnings.push("Tab 'CC thêm giờ' không tìm thấy")

    if (kpiPlan) assertPlanValid(kpiPlan.plan, kpiPlan.name, sheetMonth)
    else warnings.push("Tab 'BẢNG THEO DÕI KP CC' không tìm thấy")

    // --- Persist phase (batched writes) ---
    if (workUnitPlan) {
      await writeWorkUnits({
        companyId,
        syncedBy,
        plan: workUnitPlan.plan,
        monthStart,
        monthEnd,
        rowsAffected,
      })
    }
    logHeap("after-workunit-upsert", companyId, heapPeak)

    if (overtimePlan) {
      await writeOvertime({
        companyId,
        syncedBy,
        plan: overtimePlan.plan,
        monthStart,
        monthEnd,
        rowsAffected,
      })
    }
    logHeap("after-overtime-upsert", companyId, heapPeak)

    if (kpiPlan) {
      await writeKpi({
        companyId,
        syncedBy,
        plan: kpiPlan.plan,
        monthStart,
        monthEnd,
        rowsAffected,
      })
    }
    logHeap("after-kpi-upsert", companyId, heapPeak)

    // --- Recalc DRAFT payrolls (fire-and-forget) ---
    recalculateMonth(companyId, monthStart).catch(e =>
      console.warn("sheet-sync: recalculateMonth failed", e)
    )

    logHeap("end", companyId, heapPeak)
    rowsAffected.heapPeakMB = heapPeak.v
    const durationMs = Date.now() - startTime
    await db.sheetSyncLog.create({
      data: {
        companyId,
        month: sheetMonth,
        sheetUrl,
        syncedBy,
        status: "ok",
        durationMs,
        rowsAffected: rowsAffected as unknown as object,
        errorMessage: warnings.length > 0 ? warnings.join("; ") : null,
      },
    })

    return { status: "ok", durationMs, rowsAffected, warnings }
  } catch (e) {
    logHeap("error", companyId, heapPeak)
    rowsAffected.heapPeakMB = heapPeak.v
    const durationMs = Date.now() - startTime
    const message =
      e instanceof SyncError || e instanceof SheetFetchError
        ? e.message
        : (e as Error).message ?? "Lỗi không xác định"
    await db.sheetSyncLog.create({
      data: {
        companyId,
        month: sheetMonth,
        sheetUrl,
        syncedBy,
        status: "error",
        durationMs,
        rowsAffected: rowsAffected as unknown as object,
        errorMessage: message,
      },
    })
    throw e
  } finally {
    await releaseAdvisoryLock(lockKey)
  }
}
