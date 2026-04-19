import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import { syncSheetForCompany, SyncError } from "@/lib/services/sheet-sync.service"
import { SheetFetchError } from "@/lib/google-sheet-fetcher"

/**
 * POST /api/sync/google-sheet
 *
 * Manual "Đồng bộ ngay" trigger. Admin-only. Fetches the currently-configured
 * sheet, pulls WorkUnit / OvertimeEntry / KpiViolation into the DB, and
 * writes a row to sheet_sync_logs. Advisory-locked per company so two
 * concurrent calls can't race.
 */
export async function POST() {
  try {
    const ctx = await requireRole("admin")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const settings = await db.companySettings.findUnique({
      where: { companyId: ctx.companyId },
      select: { sheetSyncEnabled: true, sheetUrl: true, sheetMonth: true },
    })

    if (!settings?.sheetSyncEnabled) {
      return NextResponse.json(
        { error: "SYNC_DISABLED", message: "Đồng bộ đang tắt — bật trong Cài đặt trước" },
        { status: 400 }
      )
    }
    if (!settings.sheetUrl || !settings.sheetMonth) {
      return NextResponse.json(
        { error: "NOT_CONFIGURED", message: "Chưa cấu hình link hoặc tháng" },
        { status: 400 }
      )
    }

    // Fallback to "unknown" if session has no email field set for some reason.
    const syncedBy = ctx.userId ?? "admin"

    try {
      const result = await syncSheetForCompany({
        companyId: ctx.companyId,
        sheetUrl: settings.sheetUrl,
        sheetMonth: settings.sheetMonth,
        syncedBy,
      })
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
    } catch (e) {
      if (e instanceof SyncError) {
        const status = e.code === "SYNC_IN_PROGRESS" ? 409 : 400
        return NextResponse.json({ error: e.code, message: e.message }, { status })
      }
      if (e instanceof SheetFetchError) {
        const status = e.code === "TIMEOUT" || e.code === "SHEET_FETCH_FAILED" ? 502 : 400
        return NextResponse.json({ error: e.code, message: e.message }, { status })
      }
      throw e
    }
  } catch (e) {
    return errorResponse(e)
  }
}
