import { z } from "zod"

export const AI_PROVIDERS = ["openai", "anthropic", "google"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const UpdateAiConfigSchema = z
  .object({
    provider: z.enum(AI_PROVIDERS).optional(),
    model: z.string().min(1).max(100).optional(),
    // Plaintext — server encrypts before storing. Empty string = "leave existing
    // key alone". To clear, send `clearKey: true`.
    apiKey: z.string().min(1).max(500).optional(),
    clearKey: z.boolean().optional(),
    systemPromptAdmin: z.string().max(20000).optional(),
    systemPromptManager: z.string().max(20000).optional(),
    systemPromptEmployee: z.string().max(20000).optional(),
    companyRules: z.string().max(20000).optional(),
    enabled: z.boolean().optional(),
    monthlyTokenLimit: z.number().int().min(0).max(100_000_000).optional(),
  })
  .strict()

export type UpdateAiConfigInput = z.infer<typeof UpdateAiConfigSchema>

export const AI_ROLE_SCOPES = ["admin", "manager", "employee"] as const
export type AiRoleScope = (typeof AI_ROLE_SCOPES)[number]

export const TestAiChatSchema = z
  .object({
    message: z.string().min(1).max(2000).default("Xin chào, bạn có nghe tôi không?"),
    role: z.enum(AI_ROLE_SCOPES).default("admin"),
  })
  .strict()

export type TestAiChatInput = z.infer<typeof TestAiChatSchema>
