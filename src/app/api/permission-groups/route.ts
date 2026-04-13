import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { z } from "zod"

const CreateGroupSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const groups = await db.permissionGroup.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(groups)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const companyId = (session.user as any).companyId
  const body = await req.json()
  const parsed = CreateGroupSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const group = await db.permissionGroup.create({
    data: { companyId, ...parsed.data },
  })
  return NextResponse.json(group, { status: 201 })
}
