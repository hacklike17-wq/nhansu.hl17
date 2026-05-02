import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { recalculateMonth } from "@/lib/services/payroll.service"
import { lockedEmployeeIdsForMonth } from "@/lib/chamcong-guard"
import { verifyCronAuth } from "@/lib/cron-auth"

/**
 * POST /api/cron/auto-fill-attendance
 *
 * Daily cron-called endpoint. For each company, ensures every active
 * employee has a WorkUnit row for TODAY (VN time, Mon–Sat). Runs in
 * this order per employee:
 *   1. Skip if the employee's current-month payroll is no longer DRAFT
 *      (PENDING / APPROVED / LOCKED / PAID) — chamcong-guard already
 *      blocks mutations there.
 *   2. Skip if a WorkUnit already exists for today (idempotent — cron
 *      can re-run safely).
 *   3. If the employee has an APPROVED UNPAID leave covering today,
 *      create a row with units=0 and a leave reference so the leave
 *      still registers in payroll.
 *   4. Otherwise create a default 1-công row with note="cron auto-fill".
 *
 * After each company is processed, DRAFT payrolls for the month are
 * recalculated (fire-and-forget) so Payroll.netWorkUnits stays in sync.
 *
 * Auth: Bearer token matched against env `CRON_SECRET`. The secret must
 * be long enough that brute force is impractical — generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Expected schedule: daily at 18:00 Asia/Ho_Chi_Minh (UTC+7). The
 * endpoint no-ops on Sunday (6-day work week, dow === 0).
 */

type FillResult = {
  created: number
  skippedLocked: number
  skippedExisting: number
  skippedLeave: number
  recalced?: boolean
}

async function fillOneCompanyForToday(
  companyId: string,
  todayUTC: Date,
  monthStart: Date
): Promise<FillResult> {
  const employees = await db.employee.findMany({
    where: {
      companyId,
      deletedAt: null,
      excludeFromPayroll: false,
      status: { in: ["WORKING", "HALF", "REMOTE"] },
      startDate: { lte: todayUTC },
      OR: [{ endDate: null }, { endDate: { gte: todayUTC } }],
    },
    select: { id: true },
  })

  const result: FillResult = {
    created: 0,
    skippedLocked: 0,
    skippedExisting: 0,
    skippedLeave: 0,
  }

  if (employees.length === 0) return result

  const empIds = employees.map(e => e.id)

  const [lockedIds, existing, leaves] = await Promise.all([
    lockedEmployeeIdsForMonth(companyId, monthStart, empIds),
    db.workUnit.findMany({
      where: { companyId, employeeId: { in: empIds }, date: todayUTC },
      select: { employeeId: true },
    }),
    db.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: empIds },
        type: "UNPAID",
        status: "APPROVED",
        startDate: { lte: todayUTC },
        endDate: { gte: todayUTC },
      },
      select: { id: true, employeeId: true },
    }),
  ])

  const existingEmpIds = new Set(existing.map(w => w.employeeId))
  const leaveByEmp = new Map(leaves.map(l => [l.employeeId, l.id]))

  const rows: Array<{
    companyId: string
    employeeId: string
    date: Date
    units: number
    note: string | null
    source: string
    sourceBy: string
  }> = []

  for (const emp of employees) {
    if (lockedIds.has(emp.id)) {
      result.skippedLocked++
      continue
    }
    if (existingEmpIds.has(emp.id)) {
      result.skippedExisting++
      continue
    }

    const leaveId = leaveByEmp.get(emp.id)
    if (leaveId) {
      rows.push({
        companyId,
        employeeId: emp.id,
        date: todayUTC,
        units: 0,
        note: `Nghỉ không lương — đơn ${leaveId.slice(0, 8)}`,
        source: "AUTO_FILL",
        sourceBy: "cron",
      })
      result.skippedLeave++
      continue
    }

    rows.push({
      companyId,
      employeeId: emp.id,
      date: todayUTC,
      units: 1,
      note: null,
      source: "AUTO_FILL",
      sourceBy: "cron",
    })
  }

  if (rows.length > 0) {
    const created = await db.workUnit.createMany({
      data: rows,
      skipDuplicates: true,
    })
    // created count includes units=0 leave rows (they're legit creates).
    // skippedLeave already tracks them separately for the summary.
    result.created = created.count - result.skippedLeave

    // Keep DRAFT payrolls in sync. Fire-and-forget — a recalc failure
    // must not block the cron result or future days.
    recalculateMonth(companyId, monthStart)
      .then(() => {
        result.recalced = true
      })
      .catch(err => {
        console.warn(`cron auto-fill: recalculateMonth(${companyId}) failed:`, err)
      })
  }

  return result
}

export async function POST(req: NextRequest) {
  const authResult = verifyCronAuth(req.headers.get("authorization"))
  if (!authResult.ok) {
    if (authResult.reason === "MISSING_SECRET") {
      return NextResponse.json(
        {
          error:
            "CRON_SECRET is not set. Generate one with: " +
            `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── VN "today" ────────────────────────────────────────────────
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const nowVN = new Date(Date.now() + VN_OFFSET_MS)
  const y = nowVN.getUTCFullYear()
  const m = nowVN.getUTCMonth()
  const d = nowVN.getUTCDate()
  const dow = nowVN.getUTCDay()
  const hourVN = nowVN.getUTCHours()
  const todayUTC = new Date(Date.UTC(y, m, d))
  const monthStart = new Date(Date.UTC(y, m, 1))
  const todayLabel = todayUTC.toISOString().slice(0, 10)

  if (dow === 0) {
    return NextResponse.json({
      ok: true,
      date: todayLabel,
      skipped: "sunday",
      message: "Chủ nhật — không tạo WorkUnit",
    })
  }

  // Chỉ xử lý các công ty có auto-fill bật + đúng giờ VN đã cấu hình.
  // VPS crontab fire mỗi giờ; endpoint tự lọc theo autoFillCronHour.
  const companies = await db.company.findMany({
    where: {
      settings: {
        autoFillCronEnabled: true,
        autoFillCronHour: hourVN,
      },
    },
    select: { id: true },
  })

  if (companies.length === 0) {
    return NextResponse.json({
      ok: true,
      date: todayLabel,
      hourVN,
      skipped: "no-matching-hour",
      message: `Không có công ty nào cấu hình chạy lúc ${hourVN}h`,
    })
  }

  const results: Array<{ companyId: string } & Partial<FillResult> & { error?: string }> = []
  let totalCreated = 0
  let totalSkipped = 0

  for (const company of companies) {
    try {
      const r = await fillOneCompanyForToday(company.id, todayUTC, monthStart)
      results.push({ companyId: company.id, ...r })
      totalCreated += r.created
      totalSkipped += r.skippedExisting + r.skippedLocked + r.skippedLeave
    } catch (e: any) {
      console.error(`cron auto-fill: company ${company.id} failed:`, e)
      results.push({ companyId: company.id, error: e?.message ?? "unknown error" })
    }
  }

  return NextResponse.json({
    ok: true,
    date: todayLabel,
    companiesProcessed: companies.length,
    totalCreated,
    totalSkipped,
    results,
  })
}
