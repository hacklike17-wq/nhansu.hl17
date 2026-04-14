import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import { TestAiChatSchema, type AiRoleScope } from "@/lib/schemas/ai"
import { decryptApiKey } from "@/lib/ai/crypto"
import { openaiTestChat } from "@/lib/ai/providers/openai"

/**
 * POST /api/ai/test — admin-only. Simulates the real chat by assembling the
 * exact system prompt that a given role (admin/manager/employee) will see
 * during a Phase 2 conversation — their role-specific prompt plus the
 * company rules block — then sending it to the provider. This lets the
 * admin validate that prompts + rules actually steer the answer BEFORE we
 * wire the full chat UI.
 *
 * Phase 1 scope: text-only, no tool calling. So questions about live DB
 * data ("lương tháng này của tôi…") cannot be answered yet; only questions
 * grounded in the written rules will work.
 *
 * Provider support: OpenAI only. Others → 501.
 */
function buildSystemPrompt(
  role: AiRoleScope,
  config: { systemPromptAdmin: string; systemPromptManager: string; systemPromptEmployee: string; companyRules: string }
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
    "LƯU Ý (Phase 1): Bạn CHƯA có công cụ truy vấn cơ sở dữ liệu thật. " +
      "Nếu user hỏi về số liệu cá nhân (lương, công, KPI của họ), hãy nói rõ bạn chưa truy cập được dữ liệu và đề nghị quay lại sau khi tính năng chat được bật."
  )

  return parts.join("\n\n")
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId
    if (!companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      // Empty body is fine — schema has defaults.
    }

    const parsed = TestAiChatSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const config = await db.aiConfig.findUnique({ where: { companyId } })
    if (!config || !config.apiKeyEncrypted) {
      return NextResponse.json(
        { error: "Chưa có API key — vui lòng nhập và lưu cấu hình trước." },
        { status: 400 }
      )
    }

    if (config.provider !== "openai") {
      return NextResponse.json(
        { error: `Provider "${config.provider}" chưa được hỗ trợ ở Phase 1.` },
        { status: 501 }
      )
    }

    let apiKey: string
    try {
      apiKey = decryptApiKey(config.apiKeyEncrypted)
    } catch {
      return NextResponse.json(
        { error: "Không giải mã được API key — có thể AI_ENCRYPTION_KEY đã bị đổi" },
        { status: 500 }
      )
    }

    const systemPrompt = buildSystemPrompt(parsed.data.role, {
      systemPromptAdmin: config.systemPromptAdmin,
      systemPromptManager: config.systemPromptManager,
      systemPromptEmployee: config.systemPromptEmployee,
      companyRules: config.companyRules,
    })

    try {
      const result = await openaiTestChat(apiKey, config.model, systemPrompt, parsed.data.message)
      return NextResponse.json({
        ok: true,
        provider: config.provider,
        model: config.model,
        role: parsed.data.role,
        response: result.text,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          systemPromptChars: systemPrompt.length,
        },
      })
    } catch (e: any) {
      const msg = e?.message ?? "Lỗi không xác định khi gọi provider"
      const status = typeof e?.status === "number" ? e.status : 502
      return NextResponse.json({ error: `Provider lỗi: ${msg}` }, { status })
    }
  } catch (e) {
    return errorResponse(e)
  }
}
