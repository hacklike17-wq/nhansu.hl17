/**
 * POST /api/payroll/recalculate
 * Phase 03 — Manual "Cập nhật lương" trigger.
 * Recalculates all DRAFT payrolls for the given month.
 */
import { NextRequest, NextResponse } from "next/server"
import { recalculateMonth } from "@/lib/services/payroll.service"
import { z } from "zod"
import { requirePermission, errorResponse } from "@/lib/permission"

const RecalculateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng: YYYY-MM"),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("luong.edit")
    const body = await req.json()
    const parsed = RecalculateSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const [year, month] = parsed.data.month.split("-").map(Number)
    const monthDate = new Date(Date.UTC(year, month - 1, 1))

    const updated = await recalculateMonth(ctx.companyId!, monthDate)

    return NextResponse.json({ ok: true, updated })
  } catch (e) {
    return errorResponse(e)
  }
}
