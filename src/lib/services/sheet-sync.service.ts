/**
 * sheet-sync.service.ts — core logic to pull WorkUnit / OvertimeEntry /
 * KpiViolation from a Google Sheet XLSX export into the DB.
 *
 * Design notes (from the RFC):
 *  Q1 (conflict):  if a WorkUnit row already has a non-null note, the sync
 *                  leaves it alone. Every other case upserts.
 *  Q2 (lock):      employees whose payroll for the target month is not DRAFT
 *                  are skipped entirely (counted in `skippedLocked`).
 *  Q3 (empty):     blank cells in the sheet produce no DB mutation (parser
 *                  already filters these out upstream).
 *  Q10 (month):    `monthMatches` from parser must be true, else we bail
 *                  with MONTH_MISMATCH.
 *  Q11 (missing):  each of the 3 tabs is optional — missing = warning only.
 *  Q15 (concurrent): advisory lock per companyId prevents parallel runs.
 */
import { db } from "@/lib/db"
import { lockedEmployeeIdsForMonth } from "@/lib/chamcong-guard"
import { recalculateMonth } from "@/lib/services/payroll.service"
import {
  fetchSheetWorkbook,
  findTabs,
  SheetFetchError,
} from "@/lib/google-sheet-fetcher"
import {
  planWorkUnitsImport,
  planOvertimeImport,
  planKpiImport,
  type ImportCtx,
} from "@/lib/data-import"

export type SyncRowsAffected = {
  workUnit: number
  overtime: number
  kpi: number
  /** Rows that could NOT be written because the employee is not in the DB. */
  skippedEmps: number
  /** Rows skipped because the employee's payroll is locked for this month. */
  skippedLocked: number
  /** Rows preserved because the existing WorkUnit row has a manager's note. */
  preservedNotes: number
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
    const { monthStart, monthEnd } = monthBoundaries(sheetMonth)

    // --- Fetch + parse sheet ---
    const wb = await fetchSheetWorkbook(sheetUrl)
    const tabs = findTabs(wb)

    if (!tabs.workUnit && !tabs.overtime && !tabs.kpi) {
      throw new SyncError(
        "NO_TABS_FOUND",
        `Không tìm thấy tab nào cần đồng bộ. Các tab có trong sheet: ${tabs.availableTabs.join(", ")}`
      )
    }

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

    // --- Sync WorkUnit tab ---
    if (tabs.workUnit) {
      const plan = planWorkUnitsImport(tabs.workUnit, ctx)
      if (!plan.monthMatches) {
        throw new SyncError(
          "MONTH_MISMATCH",
          `Tab '${tabs.workUnit.name}' chứa ngày không thuộc tháng ${sheetMonth}`
        )
      }
      if (plan.errors.length > 0) {
        throw new SyncError(
          "PARSE_ERROR",
          `Tab '${tabs.workUnit.name}' có lỗi: ${plan.errors[0].message}`
        )
      }

      // Q1: preserve rows that already have a manager note.
      const existing = await db.workUnit.findMany({
        where: {
          companyId,
          employeeId: { in: plan.upserts.map(u => u.employeeId) },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, date: true, note: true },
      })
      const notedKeys = new Set(
        existing
          .filter(e => e.note)
          .map(e => `${e.employeeId}|${(e.date as Date).toISOString().slice(0, 10)}`)
      )

      for (const row of plan.upserts) {
        const key = `${row.employeeId}|${row.date.toISOString().slice(0, 10)}`
        if (notedKeys.has(key)) {
          rowsAffected.preservedNotes++
          continue
        }
        await db.workUnit.upsert({
          where: { employeeId_date: { employeeId: row.employeeId, date: row.date } },
          create: {
            companyId,
            employeeId: row.employeeId,
            date: row.date,
            units: row.units,
            note: row.note,
            source: "SHEET_SYNC",
            sourceBy: syncedBy,
          },
          update: { units: row.units, note: row.note, source: "SHEET_SYNC", sourceBy: syncedBy },
        })
        rowsAffected.workUnit++
      }

      // Count skipped (parser bucket reasons)
      for (const s of plan.skipped) {
        if (s.reason.includes("không tồn tại")) rowsAffected.skippedEmps++
        else if (s.reason.includes("bảng lương")) rowsAffected.skippedLocked++
      }
    } else {
      warnings.push("Tab 'BANG CHAM CONG' không tìm thấy")
    }

    // --- Sync Overtime tab ---
    if (tabs.overtime) {
      const plan = planOvertimeImport(tabs.overtime, ctx)
      if (!plan.monthMatches) {
        throw new SyncError(
          "MONTH_MISMATCH",
          `Tab '${tabs.overtime.name}' chứa ngày không thuộc tháng ${sheetMonth}`
        )
      }
      if (plan.errors.length > 0) {
        throw new SyncError(
          "PARSE_ERROR",
          `Tab '${tabs.overtime.name}' có lỗi: ${plan.errors[0].message}`
        )
      }

      // OvertimeEntry has no @@unique(employeeId, date); do manual upsert.
      for (const row of plan.upserts) {
        const existing = await db.overtimeEntry.findFirst({
          where: { companyId, employeeId: row.employeeId, date: row.date },
          select: { id: true },
        })
        if (existing) {
          await db.overtimeEntry.update({
            where: { id: existing.id },
            data: { hours: row.hours, note: row.note, source: "SHEET_SYNC", sourceBy: syncedBy },
          })
        } else {
          await db.overtimeEntry.create({
            data: {
              companyId,
              employeeId: row.employeeId,
              date: row.date,
              hours: row.hours,
              note: row.note,
              source: "SHEET_SYNC",
              sourceBy: syncedBy,
            },
          })
        }
        rowsAffected.overtime++
      }
    } else {
      warnings.push("Tab 'CC thêm giờ' không tìm thấy")
    }

    // --- Sync KPI tab ---
    if (tabs.kpi) {
      const plan = planKpiImport(tabs.kpi, ctx)
      if (!plan.monthMatches) {
        throw new SyncError(
          "MONTH_MISMATCH",
          `Tab '${tabs.kpi.name}' chứa ngày không thuộc tháng ${sheetMonth}`
        )
      }
      if (plan.errors.length > 0) {
        throw new SyncError(
          "PARSE_ERROR",
          `Tab '${tabs.kpi.name}' có lỗi: ${plan.errors[0].message}`
        )
      }

      for (const row of plan.upserts) {
        const existing = await db.kpiViolation.findFirst({
          where: { companyId, employeeId: row.employeeId, date: row.date },
          select: { id: true },
        })
        if (existing) {
          await db.kpiViolation.update({
            where: { id: existing.id },
            data: { types: row.types, note: row.note, source: "SHEET_SYNC", sourceBy: syncedBy },
          })
        } else {
          await db.kpiViolation.create({
            data: {
              companyId,
              employeeId: row.employeeId,
              date: row.date,
              types: row.types,
              note: row.note,
              source: "SHEET_SYNC",
              sourceBy: syncedBy,
            },
          })
        }
        rowsAffected.kpi++
      }
    } else {
      warnings.push("Tab 'BẢNG THEO DÕI KP CC' không tìm thấy")
    }

    // --- Recalc DRAFT payrolls (fire-and-forget) ---
    recalculateMonth(companyId, monthStart).catch(e =>
      console.warn("sheet-sync: recalculateMonth failed", e)
    )

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
