import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    const { id } = await params
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    // Confirm payroll exists in company and — for employees — is their own
    const payroll = await db.payroll.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true, employeeId: true },
    })
    if (!payroll) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (ctx.role === "employee" && payroll.employeeId !== ctx.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const entries = await db.auditLog.findMany({
      where: {
        companyId: ctx.companyId,
        entityType: "Payroll",
        entityId: id,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        changedBy: true,
        changes: true,
        createdAt: true,
      },
    })

    // Enrich with user display names
    const userIds = Array.from(new Set(entries.map(e => e.changedBy).filter(Boolean))) as string[]
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const userMap = new Map(users.map(u => [u.id, u.name ?? u.email ?? u.id]))

    return NextResponse.json(
      entries.map(e => ({
        id: e.id,
        action: e.action,
        changedBy: e.changedBy,
        changedByName: e.changedBy ? userMap.get(e.changedBy) ?? null : null,
        changes: e.changes,
        createdAt: e.createdAt,
      }))
    )
  } catch (e) {
    return errorResponse(e)
  }
}
