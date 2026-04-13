import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"

/**
 * GET /api/chamcong/audit-log
 *   ?employeeId=...      (optional; ignored for employee role — forced to self)
 *   &month=YYYY-MM       (optional; filters by AFFECTED month, not createdAt)
 *   &entityType=WorkUnit | OvertimeEntry | KpiViolation | ALL  (default ALL)
 *
 * Returns audit entries for chamcong-related changes, enriched with actor
 * display name AND (when available) the affected employee's name.
 *
 * Filter semantics (bug fix — phương án A: month-wide):
 *   - The `month` param filters by the DATA MONTH that the audit row
 *     affects, not by when the change was recorded. For per-cell mutations
 *     (WorkUnit / OvertimeEntry / KpiViolation) this means
 *     `changes.date.startsWith("YYYY-MM")`. For batch ops (AUTO_FILL,
 *     BULK_DELETE) it means `changes.month === "YYYY-MM"`.
 *   - Prisma doesn't support JSON `startsWith` cleanly across providers,
 *     so we over-fetch 500 most-recent rows and filter in JS.
 *
 * Per user decision, the log drawer now shows ALL changes in the selected
 * month across ALL employees (not scoped to the employee whose row was
 * clicked). So when `employeeId` is absent, we skip the employee filter
 * entirely — the result becomes "everything that happened in month X".
 *
 * Permission: chamcong.view. Employee role is still hard-scoped to self.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.view")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const companyId = ctx.companyId

    const { searchParams } = new URL(req.url)
    const employeeIdParam = searchParams.get("employeeId")
    const monthParam = searchParams.get("month")
    const entityTypeParam = searchParams.get("entityType")

    // Employees can ONLY see their own audit. Manager/admin may optionally
    // pass employeeId; if absent, show all (company-wide month log).
    const employeeId = ctx.role === "employee" ? ctx.employeeId : employeeIdParam

    // Filter by entityType
    let entityTypes: string[]
    if (entityTypeParam && entityTypeParam !== "ALL") {
      if (!["WorkUnit", "OvertimeEntry", "KpiViolation"].includes(entityTypeParam)) {
        return NextResponse.json({ error: "entityType invalid" }, { status: 400 })
      }
      entityTypes = [entityTypeParam]
    } else {
      entityTypes = ["WorkUnit", "OvertimeEntry", "KpiViolation"]
    }

    // Validate month param (optional)
    const monthMatches = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : null

    // Over-fetch to compensate for in-memory filtering. 500 covers a small
    // company for many months. Raise if needed.
    const rawRows = await db.auditLog.findMany({
      where: {
        companyId,
        entityType: { in: entityTypes },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    })

    // In-memory filter: month (by affected date) + employeeId (optional)
    const filtered = rawRows.filter(r => {
      const c = (r.changes as any) ?? {}

      // Month filter — match affected data month, not createdAt
      if (monthMatches) {
        // Per-cell ops store `changes.date` = "YYYY-MM-DD"
        // Batch ops (AUTO_FILL, BULK_DELETE) store `changes.month` = "YYYY-MM"
        const affected: string | undefined = c.date ?? c.month
        // Ops without a date-ish field fall through (rare — keep them so
        // nothing is silently dropped)
        if (typeof affected === "string") {
          if (!affected.startsWith(monthMatches)) return false
        }
      }

      // Employee filter (optional, skipped when caller didn't request it)
      if (employeeId) {
        const affectedEmp: string | undefined = c.employeeId
        if (affectedEmp && affectedEmp !== employeeId) return false
        // Fallback: entityId = employeeId for BULK_DELETE of an employee's month
        if (!affectedEmp && r.entityId !== employeeId) return false
      }

      return true
    })

    const rows = filtered.slice(0, 30)

    // Resolve actor names
    const userIds = Array.from(new Set(rows.map(r => r.changedBy).filter(Boolean))) as string[]
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const userNameMap = new Map(users.map(u => [u.id, u.name ?? u.email ?? u.id]))

    // Resolve affected employee names (for the month-wide view where
    // entries come from different employees)
    const affectedEmpIds = Array.from(
      new Set(
        rows
          .map(r => (r.changes as any)?.employeeId ?? null)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    )
    const affectedEmps = affectedEmpIds.length
      ? await db.employee.findMany({
          where: { id: { in: affectedEmpIds } },
          select: { id: true, fullName: true },
        })
      : []
    const empNameMap = new Map(affectedEmps.map(e => [e.id, e.fullName]))

    return NextResponse.json(
      {
        month: monthMatches,
        scope: employeeId ? "employee" : "company",
        entries: rows.map(r => {
          const c = (r.changes as any) ?? {}
          const empId: string | undefined = c.employeeId
          return {
            id: r.id,
            entityType: r.entityType,
            entityId: r.entityId,
            action: r.action,
            changedBy: r.changedBy,
            changedByName: r.changedBy ? userNameMap.get(r.changedBy) ?? null : null,
            affectedEmployeeId: empId ?? null,
            affectedEmployeeName: empId ? empNameMap.get(empId) ?? null : null,
            changes: r.changes,
            createdAt: r.createdAt,
          }
        }),
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
