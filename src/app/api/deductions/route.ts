import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { CreateDeductionSchema } from "@/lib/schemas/attendance"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = (session.user as any).companyId
  const month = searchParams.get("month")
  const employeeId = searchParams.get("employeeId")
  const status = searchParams.get("status")

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
      companyId,
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
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const body = await req.json()

  const parsed = CreateDeductionSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { employeeId, date, type, delta, reason } = parsed.data
  const dateObj = new Date(date + "T00:00:00Z")

  const record = await db.deductionEvent.create({
    data: { companyId, employeeId, date: dateObj, type, delta, reason, status: "PENDING" },
  })

  return NextResponse.json(record, { status: 201 })
}
