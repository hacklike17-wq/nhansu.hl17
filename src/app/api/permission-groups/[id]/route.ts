import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { z } from "zod"

const UpdateGroupSchema = z.object({
  permissions: z.array(z.string()),
  label: z.string().optional(),
  description: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const companyId = (session.user as any).companyId
  const body = await req.json()
  const parsed = UpdateGroupSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const group = await db.permissionGroup.update({
    where: { id },
    data: parsed.data,
  })
  return NextResponse.json(group)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  // Prevent deleting system groups
  const group = await db.permissionGroup.findUnique({ where: { id } })
  if (group?.isSystem)
    return NextResponse.json({ error: "Cannot delete system group" }, { status: 400 })

  await db.permissionGroup.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
