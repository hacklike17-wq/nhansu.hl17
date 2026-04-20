import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { syncSheetForCompany, SyncError } from "@/lib/services/sheet-sync.service"
import { SheetFetchError } from "@/lib/google-sheet-fetcher"
import { verifyCronAuth } from "@/lib/cron-auth"

/**
 * POST /api/cron/sync-sheet
 *
 * Hourly cron trigger. VPS crontab fire mỗi giờ (`0 * * * *`); endpoint
 * tự lọc theo `sheetSyncCronHour` đã cấu hình để chỉ chạy đúng giờ admin
 * mong muốn. Chạy 7 ngày/tuần (kể cả Chủ nhật) — khác auto-fill.
 *
 * Auth: Bearer CRON_SECRET (reuses the same env var as auto-fill cron),
 * validated in constant time via verifyCronAuth() to neutralize timing
 * oracle attacks.
 */
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

  // --- VN hour (dùng để lọc công ty theo sheetSyncCronHour) ---
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const nowVN = new Date(Date.now() + VN_OFFSET_MS)
  const hourVN = nowVN.getUTCHours()

  // --- Find all companies with sync enabled + configured + đúng giờ VN ---
  const companies = await db.companySettings.findMany({
    where: {
      sheetSyncEnabled: true,
      sheetSyncCronHour: hourVN,
      sheetUrl: { not: null },
      sheetMonth: { not: null },
    },
    select: { companyId: true, sheetUrl: true, sheetMonth: true },
  })

  if (companies.length === 0) {
    return NextResponse.json({
      ok: true,
      hourVN,
      skipped: "no-matching-hour",
      message: `Không có công ty nào cấu hình sync lúc ${hourVN}h`,
    })
  }

  const results: Array<{
    companyId: string
    status: "ok" | "error"
    message?: string
    rowsAffected?: unknown
  }> = []

  for (const c of companies) {
    try {
      const r = await syncSheetForCompany({
        companyId: c.companyId,
        sheetUrl: c.sheetUrl!,
        sheetMonth: c.sheetMonth!,
        syncedBy: "cron",
      })
      results.push({
        companyId: c.companyId,
        status: "ok",
        rowsAffected: r.rowsAffected,
      })
    } catch (e) {
      const message =
        e instanceof SyncError || e instanceof SheetFetchError
          ? e.message
          : (e as Error).message ?? "unknown error"
      console.warn(`cron sync-sheet: ${c.companyId} failed:`, message)
      results.push({ companyId: c.companyId, status: "error", message })
    }
  }

  return NextResponse.json({
    ok: true,
    companiesProcessed: companies.length,
    results,
  })
}
