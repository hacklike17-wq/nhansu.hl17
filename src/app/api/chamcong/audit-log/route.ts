import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"

/**
 * GET /api/chamcong/audit-log
 *   ?employeeId=...      (optional)
 *   &month=YYYY-MM       (optional, default current)
 *   &entityType=WorkUnit | OvertimeEntry | KpiViolation | ALL  (default ALL)
 *
 * Returns the most recent 30 audit entries for chamcong-related changes.
 * Each entry includes the actor's display name (User.name) joined in.
 *
 * Used by the chamcong page log drawer to show "ai thêm/xoá khi nào".
 *
 * Permission: chamcong.view (everyone with attendance view permission).
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

    // Employees can only see their own audit
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

    // Month range filter — applied to AuditLog.createdAt (when the change happened),
    // NOT the affected date. This way "tháng 4" = changes made in April.
    let dateFilter = {}
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number)
      const start = new Date(Date.UTC(y, m - 1, 1))
      const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
      dateFilter = { createdAt: { gte: start, lte: end } }
    }

    // We can't filter audit rows by employeeId directly (it's nested inside JSON
    // changes). For employee-scoped queries, fetch a wider window then filter.
    const rawRows = await db.auditLog.findMany({
      where: {
        companyId,
        entityType: { in: entityTypes },
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
      take: employeeId ? 200 : 30, // over-fetch when filtering by employee
    })

    let rows = rawRows
    if (employeeId) {
      rows = rawRows.filter(r => {
        const c = r.changes as any
        return c?.employeeId === employeeId || r.entityId === employeeId
      })
      rows = rows.slice(0, 30)
    }

    // Resolve actor names
    const userIds = Array.from(new Set(rows.map(r => r.changedBy).filter(Boolean))) as string[]
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const nameMap = new Map(users.map(u => [u.id, u.name ?? u.email ?? u.id]))

    return NextResponse.json(
      {
        entries: rows.map(r => ({
          id: r.id,
          entityType: r.entityType,
          entityId: r.entityId,
          action: r.action,
          changedBy: r.changedBy,
          changedByName: r.changedBy ? nameMap.get(r.changedBy) ?? null : null,
          changes: r.changes,
          createdAt: r.createdAt,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
