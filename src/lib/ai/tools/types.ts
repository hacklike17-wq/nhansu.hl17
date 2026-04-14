/**
 * Tool-calling runtime types.
 *
 * A Tool is a typed, scoped server function that the LLM can invoke by
 * name with JSON arguments. Each Tool knows how to describe itself to
 * OpenAI (JSON Schema parameters) and how to execute safely on the server
 * (execute() receives the authenticated `ToolContext` — NEVER the raw
 * employeeId from the LLM).
 *
 * Phase 2.2 registers admin-scope tools. Phase 2.3 will add self-scope
 * tools for manager + employee with `employeeId` hard-pinned from ctx.
 */

export type ToolScope = "admin" | "self"

export type ToolRole = "admin" | "manager" | "employee"

export type ToolContext = {
  companyId: string
  userId: string
  role: ToolRole
  employeeId: string | null
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string }

export type JsonSchemaObject = {
  type: "object"
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: JsonSchemaObject
  scope: ToolScope
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

/** Convert our internal ToolDefinition → OpenAI function-tool schema. */
export function toolToOpenAISchema(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}
