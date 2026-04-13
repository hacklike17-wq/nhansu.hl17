import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"

const CATEGORIES = ["DM", "NP", "NS", "KL", "QC"] as const
type Category = (typeof CATEGORIES)[number]

/**
 * GET /api/dashboard/attendance-kpi?month=YYYY-MM
 *
 * Aggregates KpiViolation.types occurrences for the given month.
 * Scope rules:
 *  - employee: only own employeeId (server-enforced, query param ignored)
 *  - manager/admin: company-wide
 *
 * This is the single source of truth the dashboard reads; it queries the
 * exact same `kpi_violations` table that /chamcong writes to, so any change
 * in chamcong is immediately reflected after SWR revalidation.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession()
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month") // YYYY-MM
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : null
    const now = new Date()
    const [year, monthNum] = m
      ? m.split("-").map(Number)
      : [now.getUTCFullYear(), now.getUTCMonth() + 1]

    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1))
    const monthEnd = new Date(Date.UTC(year, monthNum, 0))

    const rows = await db.kpiViolation.findMany({
      where: {
        companyId: ctx.companyId,
        ...(ctx.role === "employee"
          ? { employeeId: ctx.employeeId ?? "__none__" }
          : {}),
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { id: true, employeeId: true, date: true, types: true, note: true },
    })

    const tally: Record<Category, number> = { DM: 0, NP: 0, NS: 0, KL: 0, QC: 0 }
    for (const r of rows) {
      for (const t of r.types) {
        if ((CATEGORIES as readonly string[]).includes(t)) {
          tally[t as Category] += 1
        }
      }
    }

    return NextResponse.json(
      {
        month: `${year}-${String(monthNum).padStart(2, "0")}`,
        scope: ctx.role === "employee" ? "self" : "company",
        totalRows: rows.length,
        tally,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
