import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"

/**
 * GET /api/sheet-sync-logs?limit=10
 *
 * Returns the latest N sync log rows for the current company, newest first.
 * Admin-only (Q8).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const limitRaw = Number(searchParams.get("limit") ?? "10")
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 10

    const rows = await db.sheetSyncLog.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { syncedAt: "desc" },
      take: limit,
    })

    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return errorResponse(e)
  }
}
