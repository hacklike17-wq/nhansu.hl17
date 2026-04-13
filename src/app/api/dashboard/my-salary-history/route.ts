import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"

/**
 * GET /api/dashboard/my-salary-history?months=6
 *
 * Returns the caller's last N monthly payroll rows (default 6, max 24),
 * sorted ascending by month — ready to feed a bar chart.
 *
 * Scope: ALWAYS the session.employeeId; query string cannot override.
 * Manager / admin who hit this endpoint will get THEIR OWN history (if they
 * have an employee record), not company-wide data — this is "my-*", not "all".
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession()
    if (!ctx.employeeId) {
      return NextResponse.json(
        { series: [], average: 0, max: null, min: null },
        { headers: { "Cache-Control": "no-store" } }
      )
    }
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const monthsParam = parseInt(searchParams.get("months") ?? "6", 10)
    const months = Number.isFinite(monthsParam) && monthsParam > 0 && monthsParam <= 24
      ? monthsParam
      : 6

    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))

    const rows = await db.payroll.findMany({
      where: {
        companyId: ctx.companyId,
        employeeId: ctx.employeeId,
        month: { gte: start },
      },
      select: {
        month: true,
        netSalary: true,
        grossSalary: true,
        baseSalary: true,
        status: true,
        paidAt: true,
        approvedAt: true,
      },
      orderBy: { month: "asc" },
    })

    const series = rows.map(r => {
      const d = r.month as Date
      const y = d.getUTCFullYear()
      const m = d.getUTCMonth() + 1
      return {
        key: `${y}-${String(m).padStart(2, "0")}`,
        label: `${String(m).padStart(2, "0")}/${y}`,
        net: Number(r.netSalary),
        gross: Number(r.grossSalary),
        base: Number(r.baseSalary),
        status: r.status,
      }
    })

    const totalNet = series.reduce((s, r) => s + r.net, 0)
    const average = series.length > 0 ? Math.round(totalNet / series.length) : 0

    let max: { month: string; value: number } | null = null
    let min: { month: string; value: number } | null = null
    for (const r of series) {
      if (max === null || r.net > max.value) max = { month: r.label, value: r.net }
      if (min === null || r.net < min.value) min = { month: r.label, value: r.net }
    }

    return NextResponse.json(
      { series, average, max, min, count: series.length },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
