import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { requirePermission, errorResponse } from "@/lib/permission"
import { CANONICAL_ROLES, normalizeRole } from "@/constants/data"

const RoleSchema = z.object({
  role: z.enum(CANONICAL_ROLES),
  permissions: z.array(z.string()).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("phanquyen.edit")
    const { id } = await params
    const body = await req.json()
    const parsed = RoleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const normalized = normalizeRole(parsed.data.role)
    const updated = await db.user.updateMany({
      where: { employeeId: id, companyId: ctx.companyId },
      data: {
        role: normalized,
        permissions: parsed.data.permissions ?? [],
      },
    })

    return NextResponse.json({ ok: true, updated: updated.count })
  } catch (e) {
    return errorResponse(e)
  }
}
