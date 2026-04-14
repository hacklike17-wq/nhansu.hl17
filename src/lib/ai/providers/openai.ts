import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import {
  toolToOpenAISchema,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "@/lib/ai/tools"

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export type ToolCallLog = {
  name: string
  args: Record<string, unknown>
  result: ToolResult
  durationMs: number
}

/**
 * Phase 1 adapter: one-shot chat call used by the test-config endpoint AND
 * (later) the real chat endpoint. Caller is responsible for assembling the
 * full system prompt — this function does NOT add any hardcoded system
 * content, so the admin's configured prompt + company rules flow straight
 * through.
 *
 * Phase 2 will extend this with tool calling; keep the shape compatible.
 */
export async function openaiTestChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<{
  text: string
  inputTokens: number
  outputTokens: number
}> {
  const client = new OpenAI({ apiKey })

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_completion_tokens: 600,
  })

  return {
    text: res.choices[0]?.message?.content?.trim() ?? "",
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  }
}

/**
 * Multi-turn chat call. Takes a full conversation history plus the current
 * user message, prepends the system prompt, and returns the assistant's
 * reply + token usage. Phase 2.1: no tool calling yet — the AI answers
 * purely from the system prompt + rules + its own knowledge.
 */
export async function openaiChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatMessage[]
): Promise<{
  text: string
  inputTokens: number
  outputTokens: number
}> {
  const client = new OpenAI({ apiKey })

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
    ],
    max_completion_tokens: 800,
  })

  return {
    text: res.choices[0]?.message?.content?.trim() ?? "",
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  }
}

/**
 * Phase 2.2 chat call WITH tool calling. Runs an iterative loop: ask the
 * model → if it wants to call tools, execute them server-side → feed the
 * results back → repeat until the model returns plain text or we hit the
 * hard iteration cap.
 *
 * Tool execution is hard-scoped by `ctx` — the LLM never sees or influences
 * companyId/employeeId; those come from the authenticated session.
 */
const MAX_TOOL_LOOP_ITERATIONS = 5

export async function openaiChatWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  tools: ToolDefinition[],
  ctx: ToolContext
): Promise<{
  text: string
  inputTokens: number
  outputTokens: number
  toolCalls: ToolCallLog[]
}> {
  const client = new OpenAI({ apiKey })
  const toolSchemas = tools.map(toolToOpenAISchema)

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  const toolCallsLog: ToolCallLog[] = []

  for (let iter = 0; iter < MAX_TOOL_LOOP_ITERATIONS; iter++) {
    const res = await client.chat.completions.create({
      model,
      messages,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      max_completion_tokens: 1000,
    })

    totalInputTokens += res.usage?.prompt_tokens ?? 0
    totalOutputTokens += res.usage?.completion_tokens ?? 0

    const choice = res.choices[0]
    const msg = choice?.message
    if (!msg) break

    const calls = msg.tool_calls ?? []
    if (calls.length === 0) {
      // Final answer — no more tool calls requested.
      return {
        text: (msg.content ?? "").trim(),
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        toolCalls: toolCallsLog,
      }
    }

    // Push the assistant message so the tool results can reference its tool_call_ids.
    messages.push(msg as ChatCompletionMessageParam)

    // Execute each requested tool, append the result as a "tool" message.
    for (const call of calls) {
      if (call.type !== "function") continue
      const name = call.function.name
      let args: Record<string, unknown> = {}
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
      } catch {
        args = { _parseError: true, raw: call.function.arguments }
      }

      const tool = tools.find(t => t.name === name)
      const start = Date.now()
      let result: ToolResult
      if (!tool) {
        result = { ok: false, error: `Tool không tồn tại: ${name}` }
      } else {
        try {
          result = await tool.execute(args, ctx)
        } catch (e: any) {
          result = { ok: false, error: e?.message ?? "Lỗi thực thi tool" }
        }
      }
      const durationMs = Date.now() - start

      toolCallsLog.push({ name, args, result, durationMs })

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      } as ChatCompletionMessageParam)
    }
  }

  return {
    text:
      "(Đã đạt giới hạn vòng lặp công cụ. Vui lòng chia nhỏ câu hỏi hoặc thử lại.)",
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    toolCalls: toolCallsLog,
  }
}

// Catalog of OpenAI models lives in ./models.ts (client-safe — no server
// imports). Re-export to keep the old import path working for server code
// that already imported from here.
export { OPENAI_MODELS } from "./models"
