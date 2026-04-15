import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse } from "@/lib/permission"
import { buildBackup, type BackupScope } from "@/lib/services/backup.service"

/**
 * GET /api/backup/export?scope=all|salary-config|hr
 *
 * Downloads a JSON snapshot of "setup" data (not monthly/transactional).
 * The file is self-describing — scope + exportedAt + companyId — so the
 * importer can preview what's inside before applying.
 *
 * Admin-only, scoped to the caller's company.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    if (!ctx.companyId) {
      return NextResponse.json({ error: "Tài khoản chưa gắn với công ty" }, { status: 400 })
    }

    const scopeParam = req.nextUrl.searchParams.get("scope") ?? "all"
    if (scopeParam !== "all" && scopeParam !== "salary-config" && scopeParam !== "hr") {
      return NextResponse.json({ error: "Scope không hợp lệ" }, { status: 400 })
    }
    const scope = scopeParam as BackupScope

    const backup = await buildBackup(ctx.companyId, scope)

    // Filename: backup-<company>-<scope>-<YYYY-MM-DD>.json
    const slug = backup.companyName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "company"
    const date = new Date().toISOString().slice(0, 10)
    const filename = `backup-${slug}-${scope}-${date}.json`

    const body = JSON.stringify(backup, null, 2)
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
