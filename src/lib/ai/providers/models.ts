/**
 * Client-safe catalog of provider models. This file MUST NOT import any
 * server-only code (db, openai sdk, tools) — it's pulled into the client
 * bundle by the AI config tab.
 */
export const OPENAI_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o mini (rẻ, nhanh)" },
  { id: "gpt-4o", label: "GPT-4o (cân bằng)" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-5", label: "GPT-5" },
] as const
