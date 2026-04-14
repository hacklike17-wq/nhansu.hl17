import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"

/**
 * GET /api/ai/chat/conversations/[id]
 *
 * Returns the conversation metadata + ALL messages (oldest first) so the
 * widget can repopulate its bubble stack when the user picks a past
 * conversation from the history panel. Ownership is enforced — a mismatch
 * returns 404, not 403, to avoid leaking existence.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    const { id } = await params

    const conv = await db.aiConversation.findFirst({
      where: { id, companyId: ctx.companyId ?? undefined, userId: ctx.userId },
      select: { id: true, title: true, role: true, createdAt: true, updatedAt: true },
    })
    if (!conv) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })

    const messages = await db.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        inputTokens: true,
        outputTokens: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      conversation: conv,
      messages: messages.filter(m => m.role === "user" || m.role === "assistant"),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * DELETE /api/ai/chat/conversations/[id]
 *
 * Hard-deletes the conversation. The schema has `onDelete: Cascade` on
 * ai_messages → deleting the conversation removes its messages too.
 * Ownership enforced the same way as GET.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    const { id } = await params

    const conv = await db.aiConversation.findFirst({
      where: { id, companyId: ctx.companyId ?? undefined, userId: ctx.userId },
      select: { id: true },
    })
    if (!conv) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })

    await db.aiConversation.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
