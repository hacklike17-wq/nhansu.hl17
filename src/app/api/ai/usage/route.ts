import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import { estimateCostUSD } from "@/lib/ai/providers/pricing"

/**
 * GET /api/ai/usage?month=YYYY-MM
 *
 * Admin-only monthly usage summary. Totals + per-user breakdown.
 * Uses AiConfig.model to estimate USD cost via the static pricing table
 * (approximate — not a real billing source).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId
    if (!companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get("month")

    let monthStart: Date
    let monthLabel: string
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number)
      monthStart = new Date(Date.UTC(y, m - 1, 1))
      monthLabel = monthParam
    } else {
      const VN_OFFSET_MS = 7 * 60 * 60 * 1000
      const nowVN = new Date(Date.now() + VN_OFFSET_MS)
      const y = nowVN.getUTCFullYear()
      const m = nowVN.getUTCMonth()
      monthStart = new Date(Date.UTC(y, m, 1))
      monthLabel = `${y}-${String(m + 1).padStart(2, "0")}`
    }

    const [rows, config] = await Promise.all([
      db.aiUsageLog.findMany({
        where: { companyId, month: monthStart },
      }),
      db.aiConfig.findUnique({
        where: { companyId },
        select: { provider: true, model: true, monthlyTokenLimit: true },
      }),
    ])

    const provider = config?.provider ?? "openai"
    const model = config?.model ?? "gpt-4o-mini"
    const limit = config?.monthlyTokenLimit ?? 0

    // Aggregate totals
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalRequests = 0
    for (const r of rows) {
      totalInputTokens += r.inputTokens
      totalOutputTokens += r.outputTokens
      totalRequests += r.requestCount
    }
    const totalTokens = totalInputTokens + totalOutputTokens
    const totalCostUSD = estimateCostUSD(provider, model, totalInputTokens, totalOutputTokens)
    const percentUsed = limit > 0 ? Math.min(100, Math.round((totalTokens / limit) * 100)) : 0

    // Per-user breakdown, joined with User name for display
    let byUser: Array<{
      userId: string
      userName: string
      userEmail: string
      inputTokens: number
      outputTokens: number
      requestCount: number
      costUSD: number
    }> = []

    if (rows.length > 0) {
      const userIds = [...new Set(rows.map(r => r.userId))]
      const users = await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
      const userMap = new Map(users.map(u => [u.id, u]))

      byUser = rows
        .map(r => {
          const u = userMap.get(r.userId)
          return {
            userId: r.userId,
            userName: u?.name ?? u?.email ?? "?",
            userEmail: u?.email ?? "",
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            requestCount: r.requestCount,
            costUSD: estimateCostUSD(provider, model, r.inputTokens, r.outputTokens),
          }
        })
        .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens))
    }

    return NextResponse.json({
      month: monthLabel,
      provider,
      model,
      totals: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens,
        requests: totalRequests,
        costUSD: totalCostUSD,
      },
      limit,
      percentUsed,
      byUser,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
