import OpenAI from "openai"

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

/** Catalog of OpenAI models we expose in the config UI. */
export const OPENAI_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o mini (rẻ, nhanh)" },
  { id: "gpt-4o", label: "GPT-4o (cân bằng)" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-5", label: "GPT-5" },
] as const
