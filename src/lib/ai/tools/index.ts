import { ADMIN_TOOLS } from "./admin-tools"
import type { ToolDefinition, ToolRole } from "./types"

export type { ToolDefinition, ToolRole, ToolContext, ToolResult } from "./types"
export { toolToOpenAISchema } from "./types"

/**
 * Phase 2.2: admin role gets the full admin tool set. Manager + employee
 * currently get nothing (Phase 2.3 will add self-scope tools). The chat
 * endpoint reads this and only passes tools for admin.
 */
export function getToolsForRole(role: ToolRole): ToolDefinition[] {
  if (role === "admin") return ADMIN_TOOLS
  return []
}

/** Look up a tool by name (scoped — doesn't cross roles). */
export function findToolForRole(role: ToolRole, name: string): ToolDefinition | undefined {
  return getToolsForRole(role).find(t => t.name === name)
}
