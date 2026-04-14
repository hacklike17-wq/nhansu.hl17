import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import { UpdateAiConfigSchema } from "@/lib/schemas/ai"
import { encryptApiKey, maskApiKey } from "@/lib/ai/crypto"

/**
 * GET /api/ai/config — admin-only. Returns the company's AI config WITHOUT
 * the encrypted key or any plaintext key material. Missing row → defaults.
 */
export async function GET() {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId
    if (!companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const row = await db.aiConfig.findUnique({ where: { companyId } })
    if (!row) {
      return NextResponse.json({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKeyLast4: null,
        hasApiKey: false,
        systemPromptAdmin: "",
        systemPromptManager: "",
        systemPromptEmployee: "",
        companyRules: "",
        enabled: false,
        monthlyTokenLimit: 1000000,
      })
    }

    const { apiKeyEncrypted, ...rest } = row
    return NextResponse.json({ ...rest, hasApiKey: !!apiKeyEncrypted })
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * PATCH /api/ai/config — admin-only. Upserts the company's config.
 *
 * Key handling:
 *   - apiKey omitted / empty  → existing ciphertext untouched
 *   - apiKey provided         → encrypted + stored, apiKeyLast4 updated
 *   - clearKey: true          → apiKeyEncrypted + apiKeyLast4 wiped
 */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId
    if (!companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Request body không hợp lệ" }, { status: 400 })
    }

    const parsed = UpdateAiConfigSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { apiKey, clearKey, ...fields } = parsed.data
    const updateData: Record<string, unknown> = { ...fields }

    if (clearKey) {
      updateData.apiKeyEncrypted = null
      updateData.apiKeyLast4 = null
    } else if (apiKey && apiKey.trim().length > 0) {
      updateData.apiKeyEncrypted = encryptApiKey(apiKey.trim())
      updateData.apiKeyLast4 = maskApiKey(apiKey.trim())
    }

    const row = await db.aiConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        provider: (fields.provider as string | undefined) ?? "openai",
        model: (fields.model as string | undefined) ?? "gpt-4o-mini",
        systemPromptAdmin: (fields.systemPromptAdmin as string | undefined) ?? "",
        systemPromptManager: (fields.systemPromptManager as string | undefined) ?? "",
        systemPromptEmployee: (fields.systemPromptEmployee as string | undefined) ?? "",
        companyRules: (fields.companyRules as string | undefined) ?? "",
        enabled: (fields.enabled as boolean | undefined) ?? false,
        monthlyTokenLimit: (fields.monthlyTokenLimit as number | undefined) ?? 1000000,
        apiKeyEncrypted: (updateData.apiKeyEncrypted as string | null | undefined) ?? null,
        apiKeyLast4: (updateData.apiKeyLast4 as string | null | undefined) ?? null,
      },
      update: updateData,
    })

    const { apiKeyEncrypted, ...rest } = row
    return NextResponse.json({ ...rest, hasApiKey: !!apiKeyEncrypted })
  } catch (e) {
    return errorResponse(e)
  }
}
