import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { z } from "zod"

const RoleSchema = z.object({
  role: z.string().min(1),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sessionRole = (session.user as any).role
  if (!["boss_admin", "admin"].includes(sessionRole))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const companyId = (session.user as any).companyId
  const body = await req.json()
  const parsed = RoleSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updated = await db.user.updateMany({
    where: { employeeId: id, companyId },
    data: { role: parsed.data.role },
  })

  return NextResponse.json({ ok: true, updated: updated.count })
}
