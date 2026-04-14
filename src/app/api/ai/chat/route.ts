import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"
import { ChatMessageSchema } from "@/lib/schemas/ai"
import { decryptApiKey } from "@/lib/ai/crypto"
import { openaiChat, type ChatMessage } from "@/lib/ai/providers/openai"

/**
 * Phase 2.1: text-only chat. Assembles the exact system prompt the user's
 * role should see (role prompt + company rules), loads the conversation
 * history if a conversationId is provided (or starts a new conversation),
 * appends the new user message, calls OpenAI, stores both the user and
 * assistant messages, and returns them plus the conversation id.
 *
 * Scope gating: Phase 2.1 opens the widget to admin only (enforced at the
 * UI layer). The endpoint itself accepts any authenticated user — manager
 * and employee scopes will be wired in Phase 2.3. Until then, manager /
 * employee calls will use their role prompt but still have no DB tools.
 */

// Arbitrary but sane — keeps prompt size bounded while letting the AI see
// enough history to stay coherent across a long conversation.
const MAX_HISTORY_MESSAGES = 20

function buildSystemPrompt(
  role: "admin" | "manager" | "employee",
  config: {
    systemPromptAdmin: string
    systemPromptManager: string
    systemPromptEmployee: string
    companyRules: string
  }
): string {
  const rolePrompt =
    role === "admin"
      ? config.systemPromptAdmin
      : role === "manager"
        ? config.systemPromptManager
        : config.systemPromptEmployee

  const trimmedPrompt = rolePrompt.trim()
  const trimmedRules = config.companyRules.trim()

  const parts: string[] = []
  if (trimmedPrompt.length > 0) {
    parts.push(trimmedPrompt)
  } else {
    parts.push(
      "Bạn là trợ lý AI cho hệ thống nhân sự. Trả lời bằng tiếng Việt, ngắn gọn, chính xác."
    )
  }

  if (trimmedRules.length > 0) {
    parts.push("=== NỘI QUY & QUY TẮC CÔNG TY ===")
    parts.push(trimmedRules)
    parts.push(
      "Khi trả lời câu hỏi liên quan tới nội quy, hãy trích dẫn đoạn cụ thể trong NỘI QUY ở trên."
    )
  }

  parts.push(
    [
      "LƯU Ý VỀ PHẠM VI TRẢ LỜI (Phase 2.1):",
      "",
      "1) Câu hỏi về QUY TẮC / CÔNG THỨC / BẢNG (mức phạt, điểm trừ, bảng quỹ thưởng, điều kiện KPI, phúc lợi, công tác phí, thời gian làm việc, quy trình kỷ luật…):",
      "   → TRẢ LỜI TRỰC TIẾP dựa vào NỘI QUY ở trên. Trích dẫn chính xác con số trong nội quy.",
      "   → Nếu user hỏi dạng 'nếu X thì Y thế nào?' → thực hiện phép tính theo đúng công thức trong nội quy và đưa ra kết quả cụ thể kèm cách tính.",
      "   → Nếu dữ kiện đầu vào chưa đủ (ví dụ chưa biết điểm hiện tại của user), hãy nêu ra các trường hợp theo từng mức trong bảng, KHÔNG được trả lời 'chưa có dữ liệu'.",
      "",
      "2) Câu hỏi về SỐ LIỆU THỰC TẠI TỪNG NGƯỜI (lương tháng X của họ, tổng công đi được, điểm KPI đã tích luỹ, số ngày phép còn, chi tiết vi phạm của họ…):",
      "   → Bạn CHƯA có công cụ truy vấn cơ sở dữ liệu, nói ngắn gọn: 'Tính năng tra cứu dữ liệu cá nhân đang được phát triển (Phase 2.2). Hiện tại tôi chỉ có thể giải thích quy tắc.'",
      "",
      "3) KHÔNG được từ chối trả lời chỉ vì câu hỏi có từ 'quỹ thưởng', 'lương', 'điểm', 'công'. Chỉ từ chối khi câu hỏi YÊU CẦU tra số liệu cụ thể của cá nhân đó.",
    ].join("\n")
  )

  return parts.join("\n\n")
}

function clampRole(raw: string): "admin" | "manager" | "employee" {
  if (raw === "admin" || raw === "manager" || raw === "employee") return raw
  return "employee"
}

function truncateTitle(text: string, max = 60): string {
  const stripped = text.replace(/\s+/g, " ").trim()
  if (stripped.length <= max) return stripped
  return stripped.slice(0, max - 1) + "…"
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession()
    const companyId = ctx.companyId
    if (!companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Request body không hợp lệ" }, { status: 400 })
    }

    const parsed = ChatMessageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const config = await db.aiConfig.findUnique({ where: { companyId } })
    if (!config || !config.apiKeyEncrypted) {
      return NextResponse.json(
        { error: "Trợ lý AI chưa được cấu hình — liên hệ admin để bật." },
        { status: 400 }
      )
    }
    if (!config.enabled) {
      return NextResponse.json(
        { error: "Trợ lý AI đang tắt — liên hệ admin để bật." },
        { status: 400 }
      )
    }
    if (config.provider !== "openai") {
      return NextResponse.json(
        { error: `Provider "${config.provider}" chưa được hỗ trợ.` },
        { status: 501 }
      )
    }

    let apiKey: string
    try {
      apiKey = decryptApiKey(config.apiKeyEncrypted)
    } catch {
      return NextResponse.json(
        { error: "Không giải mã được API key — liên hệ admin." },
        { status: 500 }
      )
    }

    const role = clampRole(ctx.role)

    // Resolve or create the conversation
    let conversationId = parsed.data.conversationId ?? null
    if (conversationId) {
      const existing = await db.aiConversation.findFirst({
        where: { id: conversationId, companyId, userId: ctx.userId },
        select: { id: true },
      })
      if (!existing) {
        return NextResponse.json({ error: "Không tìm thấy cuộc hội thoại" }, { status: 404 })
      }
    } else {
      const conv = await db.aiConversation.create({
        data: {
          companyId,
          userId: ctx.userId,
          role,
          title: truncateTitle(parsed.data.message),
        },
      })
      conversationId = conv.id
    }

    // Persist the user message first so it's in history for the assistant
    const userMessageRow = await db.aiMessage.create({
      data: {
        conversationId,
        role: "user",
        content: parsed.data.message,
      },
    })

    // Load recent history (oldest first, capped)
    const historyRows = await db.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    })
    const history: ChatMessage[] = historyRows
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }))

    const systemPrompt = buildSystemPrompt(role, {
      systemPromptAdmin: config.systemPromptAdmin,
      systemPromptManager: config.systemPromptManager,
      systemPromptEmployee: config.systemPromptEmployee,
      companyRules: config.companyRules,
    })

    let reply: { text: string; inputTokens: number; outputTokens: number }
    try {
      reply = await openaiChat(apiKey, config.model, systemPrompt, history)
    } catch (e: any) {
      const msg = e?.message ?? "Lỗi không xác định khi gọi provider"
      const status = typeof e?.status === "number" ? e.status : 502
      return NextResponse.json({ error: `Provider lỗi: ${msg}` }, { status })
    }

    const assistantMessageRow = await db.aiMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: reply.text || "(không có nội dung)",
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
      },
    })

    // Bump the conversation's updatedAt for sorting
    await db.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({
      conversationId,
      role,
      messages: [
        {
          id: userMessageRow.id,
          role: "user",
          content: userMessageRow.content,
          createdAt: userMessageRow.createdAt,
        },
        {
          id: assistantMessageRow.id,
          role: "assistant",
          content: assistantMessageRow.content,
          createdAt: assistantMessageRow.createdAt,
        },
      ],
      usage: {
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
