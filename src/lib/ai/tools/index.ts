import { ADMIN_TOOLS } from "./admin-tools"
import { SELF_TOOLS } from "./self-tools"
import type { ToolDefinition, ToolRole } from "./types"

export type { ToolDefinition, ToolRole, ToolContext, ToolResult } from "./types"
export { toolToOpenAISchema } from "./types"

/**
 * Admin gets the full company-wide tool set. Manager + employee both get
 * the self-scope tool set (same 5 tools — they differ only in the system
 * prompt tone, not in data scope). Every self tool hard-pins
 * `employeeId = ctx.employeeId` server-side so the LLM cannot cross-scope.
 */
export function getToolsForRole(role: ToolRole): ToolDefinition[] {
  if (role === "admin") return ADMIN_TOOLS
  // manager + employee → identical self-scope tool set
  return SELF_TOOLS
}

/** Look up a tool by name (scoped — doesn't cross roles). */
export function findToolForRole(role: ToolRole, name: string): ToolDefinition | undefined {
  return getToolsForRole(role).find(t => t.name === name)
}
