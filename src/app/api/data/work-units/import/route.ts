import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import { readWorkbookFromBuffer, parseMatrixSheet } from "@/lib/excel-io"
import { lockedEmployeeIdsForMonth } from "@/lib/chamcong-guard"

/**
 * POST /api/data/work-units/import
 *
 * Body (multipart/form-data):
 *   - file: .xlsx with one sheet in bảng-chấm-công matrix format
 *   - month: YYYY-MM (used to validate that every parsed date belongs to the
 *            intended month — catches accidental uploads of the wrong sheet)
 *   - commit: "1" to actually write, anything else = dry-run preview
 *
 * Cell semantics (matches user's existing spreadsheet conventions):
 *   - Numeric 0 / 0.5 / 1 / 1.5 / 2 / ... → work_unit with units = that value
 *   - "KL" (không lương)                    → units = 0, note = "Nghỉ"
 *   - Anything else non-empty               → error, skipped
 *
 * Behavior:
 *   - Employee matched by `code` (MÃ NV) against employees.code
 *   - Rows for employees with a non-DRAFT payroll in this month are SKIPPED
 *     (chamcong-guard rule — consistent with the /chamcong mutation guards)
 *   - Existing work_unit for the same (employeeId, date) is OVERWRITTEN by
 *     upsert, so re-importing a corrected sheet works as expected
 *   - On commit, wrapped in a single transaction; any row-level error still
 *     rolls back the whole file to keep the month consistent
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const form = await req.formData()
    const file = form.get("file") as File | null
    const month = form.get("month") as string | null
    const commit = form.get("commit") === "1"

    if (!file) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 })
    }
    // File size cap — prevent xlsx-bomb / OOM DoS on the pm2 process. 5 MB
    // is ~20× a typical monthly timesheet which is plenty of headroom.
    const MAX_IMPORT_BYTES = 5 * 1024 * 1024
    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB) — tối đa 5 MB` },
        { status: 400 }
      )
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Thiếu hoặc sai định dạng tháng (YYYY-MM)" },
        { status: 400 }
      )
    }

    const wb = await readWorkbookFromBuffer(await file.arrayBuffer())

    // Find the right sheet — any sheet containing a "MÃ NV" header will do.
    // If multiple sheets match, use the one matching the name pattern
    // "cham cong" / "chấm công" first; otherwise take the first match.
    let targetWs = wb.worksheets.find(w =>
      /ch[aâấ]m\s*c[oô]ng/i.test(w.name)
    )
    if (!targetWs) targetWs = wb.worksheets[0]
    if (!targetWs) {
      return NextResponse.json(
        { error: "File không có sheet nào" },
        { status: 400 }
      )
    }

    const [hintY, hintM] = month.split("-").map(Number)
    const parsed = parseMatrixSheet(targetWs, { year: hintY, month: hintM })
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          sheetName: targetWs.name,
          summary: { parsed: 0, valid: 0, skipped: 0, errorRows: parsed.errors.length },
          errors: parsed.errors,
        },
        { status: 400 }
      )
    }

    // Validate month match: every dayCol must be in the requested month.
    const [y, m] = month.split("-").map(Number)
    const monthStart = new Date(Date.UTC(y, m - 1, 1))
    const monthEnd = new Date(Date.UTC(y, m, 0))
    const badCols = parsed.dayCols.filter(
      dc => dc.date < monthStart || dc.date > monthEnd
    )
    if (badCols.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Sheet chứa ngày không thuộc tháng ${month} (có ${badCols.length} cột ngoài khoảng). Kiểm tra lại file hoặc chọn đúng tháng.`,
        },
        { status: 400 }
      )
    }

    // Load employee code → id map + their IDs for lockedEmployeeIds check.
    const employees = await db.employee.findMany({
      where: { companyId: ctx.companyId!, deletedAt: null, excludeFromPayroll: false },
      select: { id: true, code: true, fullName: true, endDate: true, startDate: true },
    })
    const codeToEmp = new Map<
      string,
      { id: string; fullName: string; startDate: Date; endDate: Date | null }
    >()
    for (const e of employees) {
      if (e.code) {
        codeToEmp.set(e.code, {
          id: e.id,
          fullName: e.fullName,
          startDate: e.startDate,
          endDate: e.endDate,
        })
      }
    }

    const lockedIds = await lockedEmployeeIdsForMonth(
      ctx.companyId!,
      monthStart,
      employees.map(e => e.id)
    )

    // Validate + transform every parsed cell.
    type Upsert = {
      employeeId: string
      empName: string
      date: Date
      units: number
      note: string | null
      rowIdx: number
    }
    const upserts: Upsert[] = []
    const skipped: Array<{ row: number; reason: string }> = []
    const errors: Array<{ row: number; col?: number; message: string }> = []

    for (const cell of parsed.cells) {
      const emp = codeToEmp.get(cell.empCode)
      if (!emp) {
        skipped.push({
          row: cell.rowIdx,
          reason: `Mã NV "${cell.empCode}" không tồn tại`,
        })
        continue
      }
      if (lockedIds.has(emp.id)) {
        skipped.push({
          row: cell.rowIdx,
          reason: `${emp.fullName}: bảng lương tháng ${month} đã khoá — bỏ qua`,
        })
        continue
      }

      const date = new Date(cell.date + "T00:00:00Z")
      // Respect hire / termination dates the same way auto-fill does.
      if (date < emp.startDate) {
        skipped.push({
          row: cell.rowIdx,
          reason: `${emp.fullName}: ngày ${cell.date} trước ngày vào làm`,
        })
        continue
      }
      if (emp.endDate && date > emp.endDate) {
        skipped.push({
          row: cell.rowIdx,
          reason: `${emp.fullName}: ngày ${cell.date} sau ngày kết thúc hợp đồng`,
        })
        continue
      }

      let units: number
      let note: string | null = null
      const v = cell.raw

      if (typeof v === "number") {
        units = v
      } else if (typeof v === "string") {
        const s = v.trim().toUpperCase()
        if (s === "KL") {
          units = 0
          note = "Nghỉ"
        } else {
          // Try to parse as number ("1.5" exported by some Excel versions)
          const n = Number(s.replace(",", "."))
          if (Number.isFinite(n)) {
            units = n
          } else {
            errors.push({
              row: cell.rowIdx,
              message: `Giá trị không hiểu "${v}" tại ${cell.empCode} ngày ${cell.date} (phải là số hoặc "KL")`,
            })
            continue
          }
        }
      } else {
        errors.push({
          row: cell.rowIdx,
          message: `Loại giá trị không hợp lệ tại ${cell.empCode} ngày ${cell.date}`,
        })
        continue
      }

      if (units < 0 || units > 3) {
        errors.push({
          row: cell.rowIdx,
          message: `Số công ${units} nằm ngoài khoảng [0, 3] tại ${cell.empCode} ngày ${cell.date}`,
        })
        continue
      }

      upserts.push({
        employeeId: emp.id,
        empName: emp.fullName,
        date,
        units,
        note,
        rowIdx: cell.rowIdx,
      })
    }

    // Preview shape — always returned (even on commit) so the client can show
    // the same numbers after a successful write.
    const summary = {
      parsed: parsed.cells.length,
      toUpsert: upserts.length,
      skipped: skipped.length,
      errors: errors.length,
    }

    if (errors.length > 0) {
      // Never write a partial file — bail out entirely on any error cell.
      return NextResponse.json(
        { ok: false, sheetName: targetWs.name, summary, skipped, errors },
        { status: 400 }
      )
    }

    if (!commit) {
      // Dry-run: just return the preview
      return NextResponse.json({
        ok: true,
        dryRun: true,
        sheetName: targetWs.name,
        month,
        summary,
        skipped,
        preview: upserts.slice(0, 30).map(u => ({
          empName: u.empName,
          date: u.date.toISOString().slice(0, 10),
          units: u.units,
          note: u.note,
        })),
      })
    }

    // Resolve user email for audit trail
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    })
    const sourceBy = user?.email ?? ctx.userId

    // Commit: upsert all rows in a single transaction. Fire-and-forget the
    // payroll recalc loop after commit — payroll is DRAFT by precondition
    // (lockedEmployeeIds filter above) so this is safe.
    await db.$transaction(async tx => {
      for (const u of upserts) {
        await tx.workUnit.upsert({
          where: { employeeId_date: { employeeId: u.employeeId, date: u.date } },
          create: {
            companyId: ctx.companyId!,
            employeeId: u.employeeId,
            date: u.date,
            units: u.units,
            note: u.note,
            source: "IMPORT",
            sourceBy,
          },
          update: {
            units: u.units,
            note: u.note,
            source: "IMPORT",
            sourceBy,
          },
        })
      }
      // Mark all affected draft payrolls for recalc
      const affectedEmpIds = Array.from(new Set(upserts.map(u => u.employeeId)))
      if (affectedEmpIds.length > 0) {
        await tx.payroll.updateMany({
          where: {
            companyId: ctx.companyId!,
            employeeId: { in: affectedEmpIds },
            month: monthStart,
            status: "DRAFT",
          },
          data: { needsRecalc: true },
        })
      }
    })

    return NextResponse.json({
      ok: true,
      dryRun: false,
      sheetName: targetWs.name,
      month,
      summary,
      skipped,
      message: `Đã ghi ${upserts.length} bản ghi công số tháng ${month}`,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
