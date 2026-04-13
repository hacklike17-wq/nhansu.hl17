import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { CreateEmployeeSchema } from "@/lib/schemas/employee"
import bcrypt from "bcryptjs"
import { requirePermission, requireSession, errorResponse } from "@/lib/permission"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession()
    const { searchParams } = new URL(req.url)
    const department = searchParams.get("department")
    const search = searchParams.get("search")

    // Employees can only see their own record (e.g., for personal profile page)
    if (ctx.role === "employee") {
      if (!ctx.employeeId) return NextResponse.json([])
      const me = await db.employee.findFirst({
        where: { id: ctx.employeeId, companyId: ctx.companyId ?? undefined, deletedAt: null },
        include: { user: { select: { id: true, email: true, role: true } } },
      })
      return NextResponse.json(me ? [me] : [])
    }

    const employees = await db.employee.findMany({
      where: {
        companyId: ctx.companyId ?? undefined,
        deletedAt: null,
        ...(department ? { department } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { user: { select: { id: true, email: true, role: true } } },
      orderBy: [{ createdAt: "asc" }],
    })

    return NextResponse.json(employees)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("nhanvien.edit")
    const companyId = ctx.companyId!

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Request body không hợp lệ" }, { status: 400 })
    }

    const parsed = CreateEmployeeSchema.safeParse({ ...body, companyId })
    if (!parsed.success) {
      console.error("[POST /api/employees] Zod error:", JSON.stringify(parsed.error.flatten()))
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data

    // Dedup: active employee email within company
    const existingEmp = await db.employee.findFirst({
      where: { companyId, email: data.email, deletedAt: null },
    })
    if (existingEmp) {
      return NextResponse.json(
        { error: "Email này đã được dùng cho nhân viên khác trong công ty" },
        { status: 409 }
      )
    }

    // Dedup: user email globally (unique constraint)
    if (data.accountStatus !== "NO_ACCOUNT") {
      const existingUser = await db.user.findFirst({ where: { email: data.email } })
      if (existingUser) {
        return NextResponse.json(
          { error: "Email này đã có tài khoản đăng nhập trong hệ thống" },
          { status: 409 }
        )
      }
    }

    const startDate = new Date(data.startDate)
    const dob = data.dob ? new Date(data.dob) : null

    // Atomic: create employee + user in a single transaction
    const employee = await db.$transaction(async (tx: any) => {
      const emp = await tx.employee.create({
        data: {
          companyId: data.companyId,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone ?? null,
          dob,
          gender: data.gender ?? null,
          idCard: data.idCard ?? null,
          address: data.address ?? null,
          department: data.department,
          position: data.position,
          contractType: data.contractType,
          startDate,
          baseSalary: data.baseSalary,
          responsibilitySalary: data.responsibilitySalary ?? 0,
          bankAccount: data.bankAccount ?? null,
          bankName: data.bankName ?? null,
          taxCode: data.taxCode ?? null,
          bhxhCode: data.bhxhCode ?? null,
          code: data.code ?? null,
          accountStatus: data.accountStatus ?? "ACTIVE",
        },
      })

      if (data.accountStatus !== "NO_ACCOUNT") {
        const rawPassword = data.accountPassword?.trim() || "123456"
        const hashedPassword = await bcrypt.hash(rawPassword, 12)
        await tx.user.create({
          data: {
            email: data.email,
            name: data.fullName,
            password: hashedPassword,
            role: "employee",
            employeeId: emp.id,
            companyId,
          },
        })
      }

      return emp
    })

    return NextResponse.json(employee, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error === false && error && typeof error === "object" && "code" in error) {
      const e = error as any
      if (e.code === "P2002") {
        const target: string[] = e.meta?.target ?? []
        if (target.includes("email")) {
          return NextResponse.json({ error: "Email này đã tồn tại trong hệ thống" }, { status: 409 })
        }
        return NextResponse.json({ error: `Dữ liệu bị trùng lặp: ${target.join(", ")}` }, { status: 409 })
      }
      if (e.code === "P2003") {
        return NextResponse.json({ error: "Dữ liệu liên kết không hợp lệ (foreign key)" }, { status: 400 })
      }
    }
    return errorResponse(error)
  }
}
