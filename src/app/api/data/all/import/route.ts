import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import { readWorkbookFromBuffer } from "@/lib/excel-io"
import {
  detectSheetType,
  planWorkUnitsImport,
  planOvertimeImport,
  planKpiImport,
  type ImportPlan,
  type WorkUnitRow,
  type OvertimeRow,
  type KpiRow,
} from "@/lib/data-import"
import { lockedEmployeeIdsForMonth } from "@/lib/chamcong-guard"

/**
 * POST /api/data/all/import
 *
 * Accepts a single .xlsx upload (multipart form-data) that may contain
 * several sheets. The server scans every sheet, identifies whether it
 * looks like chấm công / tăng ca / KPI by name, runs the appropriate
 * planner, and returns a summary per recognized sheet.
 *
 * Body:
 *   - file: .xlsx
 *   - month: YYYY-MM
 *   - commit: "1" to write, anything else = dry-run preview
 *   - enabled: JSON array of sheet types to actually write (only applies
 *     on commit). e.g. ["work-units","overtime"] skips the kpi sheet.
 *     Omitted on commit → write everything that has zero errors.
 *
 * Behavior:
 *   - dry-run: returns `{ ok: true, month, sheets: [...] }` — each sheet
 *     entry has sheetType + sheetName + summary + first 20 preview rows
 *   - commit: runs inside one db.$transaction so either ALL enabled
 *     sheets succeed or nothing is written. Any per-sheet error aborts
 *     the whole file.
 *   - write strategy per sheet type:
 *       work_units       → upsert by (employeeId, date)
 *       overtime_entries → deleteMany (emp×month) + createMany (no unique key)
 *       kpi_violations   → deleteMany (emp×month) + createMany (no unique key)
 *     Payroll rows for affected employees are flagged needsRecalc=true.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const form = await req.formData()
    const file = form.get("file") as File | null
    const month = form.get("month") as string | null
    const commit = form.get("commit") === "1"
    const enabledRaw = form.get("enabled") as string | null

    if (!file) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 })
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Thiếu hoặc sai định dạng tháng (YYYY-MM)" },
        { status: 400 }
      )
    }

    let enabled: Set<string> | null = null
    if (enabledRaw) {
      try {
        const arr = JSON.parse(enabledRaw)
        if (Array.isArray(arr)) enabled = new Set(arr.map(String))
      } catch {
        // ignore — treat as "all enabled"
      }
    }

    const [y, m] = month.split("-").map(Number)
    const monthStart = new Date(Date.UTC(y, m - 1, 1))
    const monthEnd = new Date(Date.UTC(y, m, 0))

    // Load employees + locked set once
    const employees = await db.employee.findMany({
      where: { companyId: ctx.companyId!, deletedAt: null },
      select: {
        id: true,
        code: true,
        fullName: true,
        startDate: true,
        endDate: true,
      },
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
    const lockedEmpIds = await lockedEmployeeIdsForMonth(
      ctx.companyId!,
      monthStart,
      employees.map(e => e.id)
    )
    const planCtx = { codeToEmp, lockedEmpIds, monthStart, monthEnd }

    // Parse workbook + dispatch
    const wb = await readWorkbookFromBuffer(await file.arrayBuffer())

    type AnyPlan =
      | ImportPlan<WorkUnitRow>
      | ImportPlan<OvertimeRow>
      | ImportPlan<KpiRow>
    const plans: AnyPlan[] = []
    const unrecognized: string[] = []

    for (const ws of wb.worksheets) {
      const type = detectSheetType(ws.name)
      if (!type) {
        unrecognized.push(ws.name)
        continue
      }
      let plan: AnyPlan
      if (type === "work-units") {
        plan = planWorkUnitsImport(ws, planCtx)
      } else if (type === "overtime") {
        plan = planOvertimeImport(ws, planCtx)
      } else {
        plan = planKpiImport(ws, planCtx)
      }
      // If a sheet was detected by name but has no usable cells AND only
      // structural errors (e.g. "MÃ NV header not found"), demote it to
      // unrecognized instead of blocking the whole file — the user's file
      // probably has reference tabs that match the name pattern.
      const isStructuralFail = plan.cellCount === 0 && plan.errors.length > 0
      if (isStructuralFail) {
        unrecognized.push(`${ws.name} (không đúng format matrix)`)
        continue
      }
      plans.push(plan)
    }

    if (plans.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `File không có sheet nào khớp với chấm công / tăng ca / KPI. Các sheet trong file: ${wb.worksheets.map(w => w.name).join(", ")}`,
        },
        { status: 400 }
      )
    }

    // Shared helper to summarize + preview
    const summarizePlan = (p: AnyPlan) => ({
      sheetName: p.sheetName,
      sheetType: p.sheetType,
      summary: {
        parsed: p.cellCount,
        toUpsert: p.upserts.length,
        skipped: p.skipped.length,
        errors: p.errors.length,
      },
      monthMatches: p.monthMatches,
      errors: p.errors.slice(0, 50),
      skipped: p.skipped.slice(0, 50),
      preview: p.upserts.slice(0, 20).map(u => ({
        empName: u.empName,
        date: u.date.toISOString().slice(0, 10),
        ...(("units" in u) ? { units: u.units, note: u.note } : {}),
        ...(("hours" in u) ? { hours: u.hours } : {}),
        ...(("types" in u) ? { types: u.types } : {}),
      })),
    })

    const sheetsReport = plans.map(summarizePlan)

    // Per-sheet gating — each sheet is either ready (errors=0 && monthMatches)
    // or flagged with a reason. We NO LONGER block the whole file on a single
    // bad sheet; the UI shows each sheet's status and lets the user tick
    // exactly which ones to commit. Only sheets flagged `ready:true` are
    // written during the commit phase.
    const sheetsReportWithFlag = sheetsReport.map(s => {
      const reasons: string[] = []
      if (s.summary.errors > 0) reasons.push(`${s.summary.errors} dòng lỗi`)
      if (!s.monthMatches)
        reasons.push(`chứa ngày không thuộc tháng ${month}`)
      return {
        ...s,
        ready: reasons.length === 0 && s.summary.toUpsert > 0,
        blockedReason: reasons.length > 0 ? reasons.join(" · ") : null,
      }
    })

    if (!commit) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        month,
        sheets: sheetsReportWithFlag,
        unrecognized,
      })
    }

    // ── Commit phase ───────────────────────────────────────────────────────
    // One transaction for everything. Per-sheet-type write strategy chosen
    // to match each table's unique-key situation.
    const affectedEmpIds = new Set<string>()

    // Resolve user email for audit trail (source=IMPORT + sourceBy=email).
    const importUser = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    })
    const importSourceBy = importUser?.email ?? ctx.userId

    await db.$transaction(async tx => {
      for (const plan of plans) {
        if (enabled && !enabled.has(plan.sheetType)) continue
        // Safety rail — never write a sheet that had errors or month
        // mismatch, even if the client sent its type in `enabled`.
        if (plan.errors.length > 0 || !plan.monthMatches) continue
        if (plan.upserts.length === 0) continue

        if (plan.sheetType === "work-units") {
          const p = plan as ImportPlan<WorkUnitRow>
          for (const u of p.upserts) {
            await tx.workUnit.upsert({
              where: {
                employeeId_date: { employeeId: u.employeeId, date: u.date },
              },
              create: {
                companyId: ctx.companyId!,
                employeeId: u.employeeId,
                date: u.date,
                units: u.units,
                note: u.note,
                source: "IMPORT",
                sourceBy: importSourceBy,
              },
              update: { units: u.units, note: u.note, source: "IMPORT", sourceBy: importSourceBy },
            })
            affectedEmpIds.add(u.employeeId)
          }
        } else if (plan.sheetType === "overtime") {
          const p = plan as ImportPlan<OvertimeRow>
          // No unique key on (employeeId, date) → delete existing rows for
          // the month+affected employees first, then createMany.
          const empIds = Array.from(new Set(p.upserts.map(u => u.employeeId)))
          if (empIds.length > 0) {
            await tx.overtimeEntry.deleteMany({
              where: {
                companyId: ctx.companyId!,
                employeeId: { in: empIds },
                date: { gte: monthStart, lte: monthEnd },
              },
            })
            if (p.upserts.length > 0) {
              await tx.overtimeEntry.createMany({
                data: p.upserts.map(u => ({
                  companyId: ctx.companyId!,
                  employeeId: u.employeeId,
                  date: u.date,
                  hours: u.hours,
                  note: u.note,
                  source: "IMPORT",
                  sourceBy: importSourceBy,
                })),
              })
            }
            empIds.forEach(id => affectedEmpIds.add(id))
          }
        } else if (plan.sheetType === "kpi") {
          const p = plan as ImportPlan<KpiRow>
          const empIds = Array.from(new Set(p.upserts.map(u => u.employeeId)))
          if (empIds.length > 0) {
            await tx.kpiViolation.deleteMany({
              where: {
                companyId: ctx.companyId!,
                employeeId: { in: empIds },
                date: { gte: monthStart, lte: monthEnd },
              },
            })
            if (p.upserts.length > 0) {
              await tx.kpiViolation.createMany({
                data: p.upserts.map(u => ({
                  companyId: ctx.companyId!,
                  employeeId: u.employeeId,
                  date: u.date,
                  types: u.types,
                  note: u.note,
                  source: "IMPORT",
                  sourceBy: importSourceBy,
                })),
              })
            }
            empIds.forEach(id => affectedEmpIds.add(id))
          }
        }
      }

      // Flag affected DRAFT payrolls for recalc
      if (affectedEmpIds.size > 0) {
        await tx.payroll.updateMany({
          where: {
            companyId: ctx.companyId!,
            employeeId: { in: Array.from(affectedEmpIds) },
            month: monthStart,
            status: "DRAFT",
          },
          data: { needsRecalc: true },
        })
      }
    })

    const writtenCount = plans.filter(
      p =>
        (!enabled || enabled.has(p.sheetType)) &&
        p.errors.length === 0 &&
        p.monthMatches &&
        p.upserts.length > 0
    ).length

    return NextResponse.json({
      ok: true,
      dryRun: false,
      month,
      sheets: sheetsReportWithFlag,
      unrecognized,
      message: `Đã ghi dữ liệu từ ${writtenCount} sheet vào hệ thống`,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
