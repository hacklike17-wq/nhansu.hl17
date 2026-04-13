import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { requirePermission, errorResponse } from "@/lib/permission"

const CreateGroupSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
})

export async function GET() {
  try {
    const ctx = await requirePermission("phanquyen.view")
    const groups = await db.permissionGroup.findMany({
      where: { companyId: ctx.companyId ?? undefined },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(groups)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("phanquyen.edit")
    if (!ctx.companyId) {
      return NextResponse.json({ error: "No company context" }, { status: 400 })
    }
    const body = await req.json()
    const parsed = CreateGroupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const group = await db.permissionGroup.create({
      data: { companyId: ctx.companyId, ...parsed.data },
    })
    return NextResponse.json(group, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
