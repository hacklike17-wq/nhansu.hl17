import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { requirePermission, errorResponse } from "@/lib/permission"

const UpdateGroupSchema = z.object({
  permissions: z.array(z.string()),
  label: z.string().optional(),
  description: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("phanquyen.edit")
    const { id } = await params
    const body = await req.json()
    const parsed = UpdateGroupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

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
    await requirePermission("phanquyen.edit")
    const { id } = await params
    const group = await db.permissionGroup.findUnique({ where: { id } })
    if (group?.isSystem) {
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
