import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"

/**
 * GET /api/ai/chat/conversations
 *
 * Returns the current user's conversations ordered newest-updated first,
 * with a message count for each row. Scoped by ctx.userId + ctx.companyId
 * so no cross-user leakage.
 */
export async function GET() {
  try {
    const ctx = await requireSession()
    const companyId = ctx.companyId
    if (!companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const rows = await db.aiConversation.findMany({
      where: { companyId, userId: ctx.userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    })

    return NextResponse.json({
      conversations: rows.map(r => ({
        id: r.id,
        title: r.title ?? "Hội thoại",
        role: r.role,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        messageCount: r._count.messages,
      })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
