import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { requirePermission, errorResponse } from "@/lib/permission"

const UpdateGroupSchema = z.object({
  permissions: z.array(z.string()),
  label: z.string().optional(),
  description: z.string().optional(),
})

/**
 * PATCH + DELETE must scope by companyId to prevent cross-tenant escalation
 * (manager at Company A mutating Company B's permission groups via enumerated
 * CUIDs). We resolve companyId from the session and guard every Prisma write.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("phanquyen.edit")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const { id } = await params
    const body = await req.json()
    const parsed = UpdateGroupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    // Tenant guard: only update if the group belongs to the caller's company.
    const existing = await db.permissionGroup.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const group = await db.permissionGroup.update({
      where: { id },
      data: parsed.data,
    })
    return NextResponse.json(group)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("phanquyen.edit")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const { id } = await params
    // Tenant guard: findFirst scoped by companyId prevents cross-tenant deletes.
    const group = await db.permissionGroup.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true, isSystem: true },
    })
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (group.isSystem) {
      return NextResponse.json(
        { error: "Cannot delete system group" },
        { status: 400 }
      )
    }
    await db.permissionGroup.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
