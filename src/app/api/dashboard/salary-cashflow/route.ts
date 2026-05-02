import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"

type Granularity = "day" | "month" | "year"

/**
 * GET /api/dashboard/salary-cashflow?granularity=day|month|year&limit=12
 *
 * Time-series of salary cash flow from the Payroll table. We count a payroll
 * as "paid out" at its `paidAt` timestamp when present (status=PAID), otherwise
 * at its `approvedAt` (status=APPROVED/LOCKED). DRAFT and PENDING rows are
 * excluded — they represent projected, not actual, salary movements.
 *
 * Scope: company-wide. Requires luong.view (finance insight).
 *
 * The returned series is sorted ascending by period and is at most `limit`
 * points long. Default limit = 12 months / 30 days / 5 years.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("luong.view")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const granularity = (searchParams.get("granularity") ?? "month") as Granularity
    if (!["day", "month", "year"].includes(granularity)) {
      return NextResponse.json({ error: "granularity phải là day|month|year" }, { status: 400 })
    }

    const limit = (() => {
      const raw = parseInt(searchParams.get("limit") ?? "", 10)
      if (Number.isFinite(raw) && raw > 0 && raw <= 120) return raw
      if (granularity === "day") return 30
      if (granularity === "year") return 5
      return 12
    })()

    // Pull APPROVED/LOCKED/PAID rows for this company; we'll bucket in JS so
    // we don't rely on Postgres date_trunc helpers not yet wired into Prisma.
    const payrolls = await db.payroll.findMany({
      where: {
        companyId: ctx.companyId,
        status: { in: ["APPROVED", "LOCKED", "PAID"] },
        employee: { excludeFromPayroll: false },
      },
      select: {
        month: true,
        netSalary: true,
        status: true,
        approvedAt: true,
        paidAt: true,
      },
    })

    type Bucket = { key: string; label: string; total: number; count: number }
    const buckets = new Map<string, Bucket>()

    function keyFor(d: Date, g: Granularity): { key: string; label: string } {
      const y = d.getUTCFullYear()
      const m = d.getUTCMonth() + 1
      const day = d.getUTCDate()
      if (g === "day") {
        const key = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        return { key, label: `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}` }
      }
      if (g === "year") {
        return { key: `${y}`, label: `${y}` }
      }
      const key = `${y}-${String(m).padStart(2, "0")}`
      return { key, label: `${String(m).padStart(2, "0")}/${y}` }
    }

    for (const p of payrolls) {
      // Effective "cash flow date": paidAt > approvedAt > month (payroll period start)
      const when: Date =
        (p.paidAt as Date | null) ??
        (p.approvedAt as Date | null) ??
        (p.month as Date)
      const { key, label } = keyFor(when, granularity)
      const prev = buckets.get(key)
      const net = Number(p.netSalary)
      if (prev) {
        prev.total += net
        prev.count += 1
      } else {
        buckets.set(key, { key, label, total: net, count: 1 })
      }
    }

    // Sort ascending by key; take last N buckets
    const series = Array.from(buckets.values())
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .slice(-limit)

    const totalSum = series.reduce((s, b) => s + b.total, 0)
    const totalCount = series.reduce((s, b) => s + b.count, 0)

    return NextResponse.json(
      {
        granularity,
        series,
        totalSum,
        totalCount,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
