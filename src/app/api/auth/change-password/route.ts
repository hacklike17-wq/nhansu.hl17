import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"

const Schema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { oldPassword, newPassword } = parsed.data
  const userId = (session.user as any).id

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user?.password) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 })

  const valid = await bcrypt.compare(oldPassword, user.password)
  if (!valid) return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 400 })

  const hashed = await bcrypt.hash(newPassword, 12)
  await db.user.update({ where: { id: userId }, data: { password: hashed } })

  return NextResponse.json({ ok: true })
}
