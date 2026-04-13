import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { requirePermission, errorResponse } from "@/lib/permission"

const InitMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng YYYY-MM"),
})

/**
 * POST /api/work-units/init-month
 *
 * Initialize default work units for a month:
 *  - For every active (non-deleted) employee in the company
 *  - For every weekday (Mon–Fri) in the month
 *  - Create a WorkUnit row with units=1.0 if none exists
 *
 * Idempotent: uses `skipDuplicates` so re-running never overwrites
 * existing edits. Returns counts of employees × workdays × new rows.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.edit")
    const companyId = ctx.companyId!
    const body = await req.json()
    const parsed = InitMonthSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const [y, m] = parsed.data.month.split("-").map(Number)
    const monthStart = new Date(Date.UTC(y, m - 1, 1))
    const monthEnd = new Date(Date.UTC(y, m, 0))

    // Tuần làm 6 ngày: Thứ 2 → Thứ 7. Chỉ Chủ nhật (dow=0) bị skip.
    const workdays: Date[] = []
    for (let d = 1; d <= monthEnd.getUTCDate(); d++) {
      const day = new Date(Date.UTC(y, m - 1, d))
      const dow = day.getUTCDay()
      if (dow !== 0) workdays.push(day)
    }

    // Active employees (exclude soft-deleted and RESIGNED)
    const employees = await db.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["WORKING", "HALF", "REMOTE"] },
      },
      select: { id: true },
    })

    if (employees.length === 0 || workdays.length === 0) {
      return NextResponse.json({ ok: true, created: 0, employees: employees.length, workdays: workdays.length })
    }

    // Pre-check which rows already exist so we can report accurate counts
    // (Prisma's createMany skipDuplicates is the authoritative guard, this is
    // just for the response body).
    const existing = await db.workUnit.findMany({
      where: {
        companyId,
        employeeId: { in: employees.map(e => e.id) },
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { employeeId: true, date: true },
    })
    const existingKeys = new Set(
      existing.map(w => `${w.employeeId}::${(w.date as Date).toISOString().slice(0, 10)}`)
    )

    const rows: Array<{
      companyId: string
      employeeId: string
      date: Date
      units: number
      note: string | null
    }> = []
    for (const emp of employees) {
      for (const day of workdays) {
        const key = `${emp.id}::${day.toISOString().slice(0, 10)}`
        if (existingKeys.has(key)) continue
        rows.push({
          companyId,
          employeeId: emp.id,
          date: day,
          units: 1.0,
          note: null,
        })
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        created: 0,
        employees: employees.length,
        workdays: workdays.length,
        message: "Tất cả ngày công đã được khởi tạo",
      })
    }

    const result = await db.workUnit.createMany({
      data: rows,
      skipDuplicates: true,
    })

    return NextResponse.json({
      ok: true,
      created: result.count,
      employees: employees.length,
      workdays: workdays.length,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
