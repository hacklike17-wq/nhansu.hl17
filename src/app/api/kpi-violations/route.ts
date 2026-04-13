import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { autoRecalcDraftPayroll } from "@/lib/services/payroll.service"

const UpsertKpiSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  types: z.array(z.string()),
  note: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = (session.user as any).companyId
  const month = searchParams.get("month")
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

  const violations = await db.kpiViolation.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      ...dateFilter,
    },
    include: { employee: { select: { id: true, fullName: true, department: true } } },
    orderBy: { date: "desc" },
  })

  return NextResponse.json(violations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const body = await req.json()

  const parsed = UpsertKpiSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { employeeId, date, types, note } = parsed.data
  const dateObj = new Date(date + "T00:00:00Z")

  // Upsert: xóa record cũ nếu có, tạo mới
  await db.kpiViolation.deleteMany({
    where: { employeeId, date: dateObj },
  })

  if (types.length === 0) {
    autoRecalcDraftPayroll(companyId, employeeId, dateObj).catch(() => {})
    return NextResponse.json({ deleted: true })
  }

  const record = await db.kpiViolation.create({
    data: { companyId, employeeId, date: dateObj, types, note },
  })

  // Phase 03: auto-recalc DRAFT payroll
  autoRecalcDraftPayroll(companyId, employeeId, dateObj).catch(err =>
    console.warn("autoRecalcDraftPayroll after kpi violation failed:", err)
  )

  return NextResponse.json(record, { status: 201 })
}
