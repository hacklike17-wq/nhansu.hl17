import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse } from "@/lib/permission"
import { applyBackup, parseBackupFile } from "@/lib/services/backup.service"

/**
 * POST /api/backup/import
 *
 * Body (multipart/form-data):
 *   - file:   .json produced by /api/backup/export
 *   - commit: "1" to actually write, anything else = dry-run preview
 *
 * Flow:
 *   1. Admin uploads file + hits "Xem trước" → dry-run → UI shows section counts
 *   2. Admin reviews → hits "Khôi phục" → commit=1 → transaction applies
 *
 * Every section present in the file is upserted by stable key (email / code
 * / key name / etc — never by cuid), so cross-environment restores work.
 * Monthly transactional data (WorkUnit, Payroll, AuditLog…) is never touched.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    if (!ctx.companyId) {
      return NextResponse.json({ error: "Tài khoản chưa gắn với công ty" }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get("file") as File | null
    const commit = form.get("commit") === "1"

    if (!file) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File quá lớn (>10MB)" }, { status: 400 })
    }

    let json: unknown
    try {
      json = JSON.parse(await file.text())
    } catch {
      return NextResponse.json({ error: "File không phải JSON hợp lệ" }, { status: 400 })
    }

    let backup
    try {
      backup = parseBackupFile(json)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "File backup không hợp lệ" }, { status: 400 })
    }

    const result = await applyBackup(ctx.companyId, backup, { dryRun: !commit })

    return NextResponse.json({
      ok: true,
      dryRun: !commit,
      fileInfo: {
        version: backup.version,
        exportedAt: backup.exportedAt,
        scope: backup.scope,
        fromCompany: backup.companyName,
        crossCompany: backup.companyId !== ctx.companyId,
      },
      summary: result.sections,
      warnings: result.warnings,
      message: commit
        ? "Đã khôi phục backup thành công"
        : "Preview dry-run — bấm Khôi phục để áp dụng",
    })
  } catch (e) {
    return errorResponse(e)
  }
}
