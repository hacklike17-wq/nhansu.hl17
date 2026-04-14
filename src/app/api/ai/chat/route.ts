import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession, errorResponse } from "@/lib/permission"
import { ChatMessageSchema } from "@/lib/schemas/ai"
import { decryptApiKey } from "@/lib/ai/crypto"
import { openaiChatWithTools, type ChatMessage } from "@/lib/ai/providers/openai"
import { getToolsForRole } from "@/lib/ai/tools"

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

  if (role === "admin") {
    parts.push(
      [
        "=== CẤP BẬC & QUYỀN HẠN HỆ THỐNG ===",
        "Hệ thống có 3 vai trò (role) cố định — mỗi nhân viên được gán ĐÚNG 1 vai trò:",
        "",
        "  1. admin    — 'Quản trị viên': toàn quyền ('*'). Cấu hình hệ thống, cấu hình lương, quản lý nhân sự, phân quyền, AI config, v.v.",
        "  2. manager  — 'Quản lý': có các quyền xem/sửa theo module — nhanvien.view, nhanvien.edit, chamcong.view, chamcong.edit, luong.view, luong.edit, tuyendung.*, nghiphep.*, doanhthu.view, chiphi.view, dongtien.view, ngansach.view, congno.view, baocao.view, dashboard.view. KHÔNG có quyền sửa cấu hình hệ thống và không cấu hình được AI.",
        "  3. employee — 'Nhân viên': chỉ xem thông tin cá nhân (dashboard.view, luong.view, chamcong.view, nghiphep.view + nghiphep.edit để tự gửi đơn).",
        "",
        "LƯU Ý về AI chat (Phase hiện tại): cả manager và employee đều chỉ xem được dữ liệu CỦA HỌ, chưa có tool truy vấn toàn công ty. Admin (vai trò của bạn đang phục vụ) có đủ 5 tool.",
        "",
        "Khi user hỏi 'ai là quản lý', 'ai là admin', 'danh sách manager'… → gọi list_employees với `role` filter tương ứng rồi liệt kê.",
        "",
        "=== CÔNG CỤ TRUY VẤN DỮ LIỆU (chỉ admin) ===",
        "Bạn ĐÃ có 5 tool để đọc dữ liệu thật trong hệ thống HR:",
        "  • get_company_overview(month?)                           — tổng quan công ty 1 tháng (headcount, tổng lương, KPI vp, payroll status)",
        "  • list_employees(department?, status?, role?, limit?)    — danh sách NV theo phòng/trạng thái/vai trò, tối đa 50. Output gồm cả `role` của từng người.",
        "  • get_employee_payroll(employeeId, month?)               — phiếu lương chi tiết 1 NV (ID cuid hoặc mã NV, ví dụ 'NV011')",
        "  • get_attendance_summary(month?, department?)            — tóm tắt chấm công, top đi nhiều/ít",
        "  • get_kpi_violations(month?, department?)                — tổng vi phạm KPI + top người vi phạm",
        "",
        "NGUYÊN TẮC DÙNG TOOL:",
        "1) Khi user hỏi SỐ LIỆU THỰC (tổng, trung bình, chi tiết của 1 người, danh sách, xếp hạng, ai là/có vai trò gì) → BẮT BUỘC gọi tool trước, KHÔNG được đoán.",
        "2) Nếu user chỉ hỏi về QUY TẮC/CÔNG THỨC → trả lời trực tiếp từ NỘI QUY ở trên, KHÔNG cần tool.",
        "3) Nếu user hỏi về CẤP BẬC HỆ THỐNG / QUYỀN CỦA ROLE → trả lời trực tiếp từ mục CẤP BẬC & QUYỀN HẠN ở trên, KHÔNG cần tool.",
        "4) Mặc định tool sẽ lấy tháng hiện tại nếu không truyền `month`. Nếu user nói 'tháng 4' → truyền '2026-04' (dựa năm hiện tại).",
        "5) Sau khi tool trả kết quả, TRÍCH DẪN con số/tên cụ thể trong câu trả lời + giải thích ngắn.",
        "6) Nếu tool trả `{ ok: false, error: ... }`, báo lỗi trung thực cho user, đừng bịa.",
      ].join("\n")
    )
  } else {
    parts.push(
      [
        "=== CÔNG CỤ TRUY VẤN DỮ LIỆU CÁ NHÂN ===",
        "Bạn có 5 tool để đọc dữ liệu CỦA CHÍNH NGƯỜI ĐANG HỎI (không phải người khác):",
        "  • get_my_info()                — hồ sơ cá nhân (tên, mã, phòng ban, chức vụ, HĐ, thâm niên, liên hệ, STK, lương cơ bản)",
        "  • get_my_payroll(month?)       — phiếu lương chi tiết tháng X (công, lương, trừ, gross, net, status)",
        "  • get_my_attendance(month?)    — chi tiết chấm công tháng X (ngày đi, công mỗi ngày, deductions)",
        "  • get_my_kpi_violations(month?)— liệt kê vi phạm KPI tháng X kèm mã code và lý do",
        "  • get_my_leave_history(year?)  — lịch sử đơn nghỉ phép trong năm (mọi trạng thái)",
        "",
        "NGUYÊN TẮC QUAN TRỌNG:",
        "1) Khi user hỏi SỐ LIỆU của họ → gọi tool thay vì nói 'tôi không biết'. Tool tự lấy tháng hiện tại nếu không truyền `month`.",
        "2) Mọi tool tự động SCOPE theo người đang hỏi — bạn KHÔNG THỂ và KHÔNG CẦN truyền employeeId.",
        "3) NẾU user hỏi về NGƯỜI KHÁC ('lương của anh A', 'bạn X vi phạm gì', 'ai trong phòng đi trễ')  → TỪ CHỐI LỊCH SỰ: 'Tôi chỉ có thể xem dữ liệu của chính bạn. Vui lòng liên hệ quản lý/admin để được giải đáp.' KHÔNG gọi tool.",
        "4) Câu hỏi về QUY TẮC / CÔNG THỨC / BẢNG (mức phạt, quỹ thưởng, nội quy, phúc lợi) → trả lời TRỰC TIẾP từ NỘI QUY ở trên, không cần tool.",
        "5) Sau khi tool trả kết quả, TRÍCH DẪN con số cụ thể. Nếu user hỏi 'tại sao bị trừ', phải dựa vào NỘI QUY để giải thích mối liên hệ giữa số liệu và rule.",
        "6) Nếu tool trả `{ ok: false, error: ... }` (ví dụ tài khoản chưa gắn hồ sơ NV), báo lỗi trung thực.",
      ].join("\n")
    )
  }

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

    const tools = getToolsForRole(role)
    let reply: {
      text: string
      inputTokens: number
      outputTokens: number
      toolCalls: Array<{ name: string; args: Record<string, unknown>; durationMs: number }>
    }
    try {
      const raw = await openaiChatWithTools(
        apiKey,
        config.model,
        systemPrompt,
        history,
        tools,
        {
          companyId,
          userId: ctx.userId,
          role,
          employeeId: ctx.employeeId ?? null,
        }
      )
      reply = {
        text: raw.text,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
        // Strip the `result` before returning to client — tool results may
        // contain internal data we don't want to expose. Keep name/args for
        // a simple "AI đã gọi tool X" trace in the UI.
        toolCalls: raw.toolCalls.map(c => ({
          name: c.name,
          args: c.args,
          durationMs: c.durationMs,
        })),
      }
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
          toolCalls: reply.toolCalls,
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
