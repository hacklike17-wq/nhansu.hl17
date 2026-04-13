/**
 * POST /api/payroll/recalculate
 * Phase 03 — Manual "Cập nhật lương" trigger.
 * Recalculates all DRAFT payrolls for the given month.
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { recalculateMonth } from "@/lib/services/payroll.service"
import { z } from "zod"

const RecalculateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng: YYYY-MM"),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin", "hr_manager"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const companyId = (session.user as any).companyId
  const body = await req.json()
  const parsed = RecalculateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const [year, month] = parsed.data.month.split("-").map(Number)
  const monthDate = new Date(Date.UTC(year, month - 1, 1))

  const updated = await recalculateMonth(companyId, monthDate)

  return NextResponse.json({ ok: true, updated })
}
