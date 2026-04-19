import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { syncSheetForCompany, SyncError } from "@/lib/services/sheet-sync.service"
import { SheetFetchError } from "@/lib/google-sheet-fetcher"

/**
 * POST /api/cron/sync-sheet
 *
 * Daily cron trigger (scheduler should fire ~19:00 VN time, after the
 * attendance auto-fill cron at 18:00). Pulls the Google Sheet for every
 * company that has sheetSyncEnabled=true AND a sheetUrl+sheetMonth set.
 *
 * Auth: Bearer CRON_SECRET (reuses the same env var as auto-fill cron).
 *
 * The endpoint no-ops on Sunday to match the company's 6-day work week.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set. Generate one with: " +
          `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      },
      { status: 500 }
    )
  }

  const auth = req.headers.get("authorization") ?? ""
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // --- Skip Sunday (VN time) ---
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const nowVN = new Date(Date.now() + VN_OFFSET_MS)
  if (nowVN.getUTCDay() === 0) {
    return NextResponse.json({ ok: true, skipped: "sunday" })
  }

  // --- Find all companies with sync enabled + configured ---
  const companies = await db.companySettings.findMany({
    where: {
      sheetSyncEnabled: true,
      sheetUrl: { not: null },
      sheetMonth: { not: null },
    },
    select: { companyId: true, sheetUrl: true, sheetMonth: true },
  })

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
