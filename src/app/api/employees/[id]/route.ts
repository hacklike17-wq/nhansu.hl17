import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { UpdateEmployeeSchema } from "@/lib/schemas/employee"
import bcrypt from "bcryptjs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const companyId = (session.user as any).companyId
  const employee = await db.employee.findFirst({
    where: { id, companyId, deletedAt: null },
    include: { user: { select: { id: true, email: true, role: true } } },
  })
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(employee)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const companyId = (session.user as any).companyId

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body không hợp lệ" }, { status: 400 })
  }

  const parsed = UpdateEmployeeSchema.safeParse(body)
  if (!parsed.success) {
    console.error("[PATCH /api/employees] Zod error:", JSON.stringify(parsed.error.flatten()))
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accountPassword, ...empData } = data as any
    const employee = await db.employee.update({
      where: { id },
      data: {
        ...empData,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        dob: data.dob ? new Date(data.dob) : undefined,
      },
    })

    // Update user password if provided
    if (accountPassword?.trim()) {
      const hashed = await bcrypt.hash(accountPassword.trim(), 12)
      await db.user.updateMany({
        where: { employeeId: id, companyId },
        data: { password: hashed },
      })
    }

    return NextResponse.json(employee)
  } catch (error: unknown) {
    console.error("[PATCH /api/employees] DB error:", error)

    if (error && typeof error === "object" && "code" in error) {
      const e = error as any
      if (e.code === "P2002") {
        return NextResponse.json({ error: "Email này đã tồn tại trong hệ thống" }, { status: 409 })
      }
    }

    const msg = error instanceof Error ? error.message : "Lỗi không xác định"
    return NextResponse.json({ error: `Lỗi máy chủ: ${msg}` }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  try {
    await db.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: "RESIGNED" },
    })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    console.error("[DELETE /api/employees] DB error:", error)
    const msg = error instanceof Error ? error.message : "Lỗi không xác định"
    return NextResponse.json({ error: `Lỗi máy chủ: ${msg}` }, { status: 500 })
  }
}
