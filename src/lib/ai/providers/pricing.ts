/**
 * Client-safe static pricing table (USD per 1M tokens) for the OpenAI
 * models we expose in the config UI. Prices are approximate and may drift
 * — treat this as a "rough cost estimate" rather than a billing system.
 *
 * Source: OpenAI public pricing as of early 2026. Admin can update the
 * constants here when OpenAI adjusts prices.
 *
 * File is client-safe (no server deps) so the AI config tab can import
 * the same helper and display estimated costs alongside the usage chart.
 */

export type ModelPrice = {
  inputPer1M: number
  outputPer1M: number
}

export const OPENAI_PRICING: Record<string, ModelPrice> = {
  "gpt-4o-mini":  { inputPer1M: 0.15, outputPer1M: 0.60 },
  "gpt-4o":       { inputPer1M: 2.50, outputPer1M: 10.00 },
  "gpt-4.1-mini": { inputPer1M: 0.40, outputPer1M: 1.60 },
  "gpt-4.1":      { inputPer1M: 2.00, outputPer1M: 8.00 },
  "gpt-5-mini":   { inputPer1M: 0.25, outputPer1M: 2.00 },
  "gpt-5":        { inputPer1M: 1.25, outputPer1M: 10.00 },
}

/** Returns estimated USD cost for a single call. 0 if model is unknown. */
export function estimateCostUSD(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (provider !== "openai") return 0
  const price = OPENAI_PRICING[model]
  if (!price) return 0
  return (
    (inputTokens / 1_000_000) * price.inputPer1M +
    (outputTokens / 1_000_000) * price.outputPer1M
  )
}
