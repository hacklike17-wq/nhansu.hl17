import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { autoRecalcDraftPayroll } from "@/lib/services/payroll.service"
import { requirePermission, errorResponse } from "@/lib/permission"

const UpsertOvertimeSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0).max(12),
  note: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.view")
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month")

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

    const entries = await db.overtimeEntry.findMany({
      where: {
        companyId: ctx.companyId ?? undefined,
        ...(employeeId ? { employeeId } : {}),
        ...dateFilter,
      },
      orderBy: { date: "asc" },
    })

    return NextResponse.json(entries)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.edit")
    const companyId = ctx.companyId!
    const body = await req.json()

    const parsed = UpsertOvertimeSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { employeeId, date, hours, note } = parsed.data
    const dateObj = new Date(date + "T00:00:00Z")

    const existingBefore = await db.overtimeEntry.findFirst({
      where: { companyId, employeeId, date: dateObj },
    })

    if (hours === 0) {
      await db.overtimeEntry.deleteMany({
        where: { companyId, employeeId, date: dateObj },
      })
      if (existingBefore) {
        db.auditLog.create({
          data: {
            companyId,
            entityType: "OvertimeEntry",
            entityId: existingBefore.id,
            action: "DELETE",
            changedBy: ctx.userId,
            changes: {
              employeeId,
              date,
              hoursFrom: Number(existingBefore.hours),
              hoursTo: 0,
            },
          },
        }).catch(err => console.warn("audit overtime DELETE failed:", err))
      }
      autoRecalcDraftPayroll(companyId, employeeId, dateObj).catch(() => {})
      return NextResponse.json({ ok: true, deleted: true })
    }

    let entry
    if (existingBefore) {
      entry = await db.overtimeEntry.update({
        where: { id: existingBefore.id },
        data: { hours, note: note ?? null },
      })
    } else {
      entry = await db.overtimeEntry.create({
        data: { companyId, employeeId, date: dateObj, hours, note: note ?? null },
      })
    }

    db.auditLog.create({
      data: {
        companyId,
        entityType: "OvertimeEntry",
        entityId: entry.id,
        action: existingBefore ? "UPDATE" : "CREATE",
        changedBy: ctx.userId,
        changes: {
          employeeId,
          date,
          hoursFrom: existingBefore ? Number(existingBefore.hours) : null,
          hoursTo: hours,
          noteFrom: existingBefore?.note ?? null,
          noteTo: note ?? null,
        },
      },
    }).catch(err => console.warn("audit overtime POST failed:", err))

    autoRecalcDraftPayroll(companyId, employeeId, dateObj).catch(err =>
      console.warn("autoRecalcDraftPayroll after overtime failed:", err)
    )

    return NextResponse.json(entry, { status: existingBefore ? 200 : 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
