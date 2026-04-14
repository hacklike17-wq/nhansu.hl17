import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { CreateLeaveRequestSchema } from "@/lib/schemas/attendance"
import { requirePermission, errorResponse } from "@/lib/permission"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("nghiphep.view")
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")

    // Employees can only see their own leave requests
    const employeeId = ctx.role === "employee"
      ? (ctx.employeeId ?? "__none__")
      : searchParams.get("employeeId")

    const requests = await db.leaveRequest.findMany({
      where: {
        companyId: ctx.companyId ?? undefined,
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: {
        employee: { select: { id: true, fullName: true, department: true } },
      },
      orderBy: { submittedAt: "desc" },
    })

    return NextResponse.json(requests)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("nghiphep.edit")
    const companyId = ctx.companyId!
    const body = await req.json()

    const parsed = CreateLeaveRequestSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { employeeId, type, startDate, endDate, reason } = parsed.data

    // Employees can only create leaves for themselves
    if (ctx.role === "employee" && employeeId !== ctx.employeeId) {
      return NextResponse.json(
        { error: "Chỉ được tạo đơn nghỉ phép cho bản thân" },
        { status: 403 }
      )
    }

    // Compute totalDays server-side instead of trusting the client — prevents
    // "submit 5-day range, claim 10 days" exploits and keeps the LeaveRequest
    // row in sync with its startDate/endDate invariant.
    const startMs = Date.parse(startDate + "T00:00:00Z")
    const endMs = Date.parse(endDate + "T00:00:00Z")
    const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1)
    if (totalDays > 365) {
      return NextResponse.json({ error: "Phạm vi nghỉ phép vượt quá 365 ngày" }, { status: 400 })
    }

    const request = await db.leaveRequest.create({
      data: {
        companyId,
        employeeId,
        type,
        startDate: new Date(startMs),
        endDate: new Date(endMs),
        totalDays,
        reason,
        status: "PENDING",
      },
    })

    return NextResponse.json(request, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
