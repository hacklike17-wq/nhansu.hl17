import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { UpsertWorkUnitSchema } from "@/lib/schemas/attendance"
import { autoRecalcDraftPayroll } from "@/lib/services/payroll.service"

/**
 * DELETE /api/work-units?employeeId=xxx&month=YYYY-MM
 * Phase 04: Remove all WorkUnits for an employee in a month.
 * Blocked if employee has an APPROVED/PAID payroll for that month.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get("employeeId")
  const month = searchParams.get("month") // YYYY-MM

  if (!employeeId || !month)
    return NextResponse.json({ error: "employeeId và month là bắt buộc" }, { status: 400 })

  const companyId = (session.user as any).companyId
  const [y, m] = month.split("-").map(Number)
  const monthStart = new Date(Date.UTC(y, m - 1, 1))
  const monthEnd   = new Date(Date.UTC(y, m, 0))

  // Verify employee belongs to company
  const employee = await db.employee.findFirst({ where: { id: employeeId, companyId } })
  if (!employee) return NextResponse.json({ error: "Nhân viên không tồn tại" }, { status: 404 })

  // Block if payroll is not DRAFT
  const payroll = await db.payroll.findUnique({
    where: { employeeId_month: { employeeId, month: monthStart } },
    select: { status: true },
  })
  if (payroll && !["DRAFT"].includes(payroll.status)) {
    return NextResponse.json(
      { error: `Không thể xóa — bảng lương đang ở trạng thái ${payroll.status}` },
      { status: 400 }
    )
  }

  const result = await db.workUnit.deleteMany({
    where: { companyId, employeeId, date: { gte: monthStart, lte: monthEnd } },
  })

  return NextResponse.json({ ok: true, deleted: result.count })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = (session.user as any).companyId
  const month = searchParams.get("month") // YYYY-MM
  const employeeId = searchParams.get("employeeId")

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

  const units = await db.workUnit.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      ...dateFilter,
    },
    include: {
      employee: { select: { id: true, fullName: true, department: true } },
    },
    orderBy: [{ date: "asc" }],
  })

  return NextResponse.json(units)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const body = await req.json()

  const parsed = UpsertWorkUnitSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { employeeId, date, units, note } = parsed.data
  const dateObj = new Date(date + "T00:00:00Z")

  const record = await db.workUnit.upsert({
    where: { employeeId_date: { employeeId, date: dateObj } },
    create: { companyId, employeeId, date: dateObj, units, note },
    update: { units, note },
  })

  // Phase 03: auto-recalc DRAFT payroll for this employee+month
  autoRecalcDraftPayroll(companyId, employeeId, dateObj).catch(err =>
    console.warn("autoRecalcDraftPayroll failed:", err)
  )

  return NextResponse.json(record, { status: 201 })
}
