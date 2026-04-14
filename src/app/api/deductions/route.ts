import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { CreateDeductionSchema } from "@/lib/schemas/attendance"
import { requirePermission, errorResponse } from "@/lib/permission"
import { requireDraftPayroll } from "@/lib/chamcong-guard"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.view")
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month")
    const status = searchParams.get("status")

    const employeeId = ctx.role === "employee"
      ? (ctx.employeeId ?? "__none__")
      : searchParams.get("employeeId")

    let dateFilter = {}
    if (month) {
      const [y, m] = month.split("-").map(Number)
      dateFilter = {
        date: {
          gte: new Date(Date.UTC(y, m - 1, 1)),
          lte: new Date(Date.UTC(y, m, 0)),
        },
      }
    }

    const deductions = await db.deductionEvent.findMany({
      where: {
        companyId: ctx.companyId ?? undefined,
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status: status as any } : {}),
        ...dateFilter,
      },
      include: {
        employee: { select: { id: true, fullName: true, department: true } },
      },
      orderBy: { date: "desc" },
    })

    return NextResponse.json(deductions)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.edit")
    const companyId = ctx.companyId!
    const body = await req.json()

    const parsed = CreateDeductionSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { employeeId, date, type, delta, reason } = parsed.data
    const dateObj = new Date(date + "T00:00:00Z")

    // Block new deductions once the target month's payroll is no longer DRAFT.
    // Without this guard, a PENDING deduction can land on a LOCKED/PAID
    // payroll and diverge from the locked snapshot on approval.
    await requireDraftPayroll(employeeId, dateObj)

    const record = await db.deductionEvent.create({
      data: { companyId, employeeId, date: dateObj, type, delta, reason, status: "PENDING" },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
