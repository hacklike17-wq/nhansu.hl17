import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import { checkSheet } from "@/lib/services/sheet-check.service"
import { SheetFetchError, isValidSheetUrl } from "@/lib/google-sheet-fetcher"

/**
 * POST /api/sync/check-sheet
 *
 * Quét sheet cấu hình tìm ô text-masquerading-as-number. Admin-only.
 * Body hỗ trợ 2 mode:
 *   - {} (body rỗng): dùng sheetUrl đã cấu hình trong CompanySettings.
 *   - { sheetUrl: "https://..." }: quét URL tuỳ chọn, không cần save.
 *     Dùng để test nhanh trước khi Lưu thiết lập.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    let url: string | null = null
    try {
      const body = await req.json()
      if (typeof body?.sheetUrl === "string" && body.sheetUrl.trim()) {
        url = body.sheetUrl.trim()
      }
    } catch {
      // empty body — fall through to settings-based URL
    }

    if (!url) {
      const settings = await db.companySettings.findUnique({
        where: { companyId: ctx.companyId },
        select: { sheetUrl: true },
      })
      url = settings?.sheetUrl ?? null
    }

    if (!url) {
      return NextResponse.json(
        { error: "NO_URL", message: "Chưa có link sheet để quét" },
        { status: 400 }
      )
    }
    if (!isValidSheetUrl(url)) {
      return NextResponse.json(
        { error: "INVALID_URL_FORMAT", message: "Link phải là Google Sheets" },
        { status: 400 }
      )
    }

    try {
      const result = await checkSheet(url)
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
    } catch (e) {
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
