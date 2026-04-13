import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { autoRecalcDraftPayroll } from "@/lib/services/payroll.service"

const UpsertOvertimeSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0).max(12),  // 0 = xóa
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

  const entries = await db.overtimeEntry.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      ...dateFilter,
    },
    orderBy: { date: "asc" },
  })

  return NextResponse.json(entries)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const body = await req.json()

  const parsed = UpsertOvertimeSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { employeeId, date, hours, note } = parsed.data
  const dateObj = new Date(date + "T00:00:00Z")

  // hours = 0 → xóa entry
  if (hours === 0) {
    await db.overtimeEntry.deleteMany({
      where: { companyId, employeeId, date: dateObj },
    })
    autoRecalcDraftPayroll(companyId, employeeId, dateObj).catch(() => {})
    return NextResponse.json({ ok: true, deleted: true })
  }

  // Upsert: tìm entry cũ → update, không có → create
  const existing = await db.overtimeEntry.findFirst({
    where: { companyId, employeeId, date: dateObj },
  })

  let entry
  if (existing) {
    entry = await db.overtimeEntry.update({
      where: { id: existing.id },
      data: { hours, note: note ?? null },
    })
  } else {
    entry = await db.overtimeEntry.create({
      data: { companyId, employeeId, date: dateObj, hours, note: note ?? null },
    })
  }

  // Phase 03: auto-recalc DRAFT payroll
  autoRecalcDraftPayroll(companyId, employeeId, dateObj).catch(err =>
    console.warn("autoRecalcDraftPayroll after overtime failed:", err)
  )

  return NextResponse.json(entry, { status: existing ? 200 : 201 })
}
