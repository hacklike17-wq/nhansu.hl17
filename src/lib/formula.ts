/**
 * Formula Engine — Phase 01 + Phase 01b
 *
 * Replaces unsafe `new Function()` evaluator with sandboxed `expr-eval`.
 * Adds dependency-graph resolution (topological sort + circular detection).
 * Returns `number | null` — null = evaluation failed, 0 = legitimate zero.
 */
import { Parser } from 'expr-eval'

const parser = new Parser()

// ─── Core eval ────────────────────────────────────────────────────────────────

/**
 * Evaluates `formula` with given `vars`.
 * Returns the evaluated number, or `null` if evaluation failed for any reason.
 * `null` ≠ `0` — null means "this formula did not produce a valid result".
 */
export function evalFormula(formula: string, vars: Record<string, number>): number | null {
  if (!formula?.trim()) {
    console.warn('evalFormula: empty formula')
    return null
  }

  try {
    const expr = parser.parse(formula)
    const result: unknown = expr.evaluate(vars)
    if (typeof result !== 'number' || !isFinite(result)) return null
    return Math.round(result)
  } catch {
    console.warn('evalFormula error:', formula)
    return null
  }
}

// ─── Variable extraction ───────────────────────────────────────────────────────

/** Extract referenced variable names from a formula string. */
export function extractVars(formula: string): string[] {
  try {
    return parser.parse(formula).variables()
  } catch {
    return []
  }
}

// ─── Dependency graph ──────────────────────────────────────────────────────────

/**
 * Build adjacency graph: colKey → [colKeys it depends on].
 * Only includes inter-column dependencies (not system vars).
 */
export function buildDependencyGraph(
  columns: Array<{ key: string; formula?: string | null; type: string }>
): Record<string, string[]> {
  const colKeys = new Set(columns.map(c => c.key))
  const graph: Record<string, string[]> = {}

  for (const col of columns) {
    if (col.type !== 'formula' || !col.formula) {
      graph[col.key] = []
      continue
    }
    graph[col.key] = extractVars(col.formula).filter(v => colKeys.has(v))
  }

  return graph
}

// ─── Topological sort ──────────────────────────────────────────────────────────

export class CircularDependencyError extends Error {
  constructor(cycle: string) {
    super(`Circular dependency: ${cycle}`)
    this.name = 'CircularDependencyError'
  }
}

/**
 * Returns colKeys in evaluation order (deps first).
 * Throws `CircularDependencyError` if a cycle is detected.
 */
export function topologicalSort(graph: Record<string, string[]>): string[] {
  const visited = new Set<string>()
  const visiting = new Set<string>() // in current DFS path
  const result: string[] = []

  function visit(node: string) {
    if (visited.has(node)) return
    if (visiting.has(node)) throw new CircularDependencyError(node)
    visiting.add(node)
    for (const dep of graph[node] ?? []) visit(dep)
    visiting.delete(node)
    visited.add(node)
    result.push(node)
  }

  for (const key of Object.keys(graph)) visit(key)
  return result // deps come before dependents
}

// ─── Circular detection (all cycles, for UI validation) ───────────────────────

/**
 * Returns all cycles in the graph as arrays of node paths.
 * Used in Phase 02 to block saving circular formulas.
 */
export function detectCircular(graph: Record<string, string[]>): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const path: string[] = []
  const pathSet = new Set<string>()

  function dfs(node: string) {
    if (pathSet.has(node)) {
      // Found a cycle — extract the cycle portion from path
      const cycleStart = path.indexOf(node)
      cycles.push([...path.slice(cycleStart), node])
      return
    }
    if (visited.has(node)) return
    pathSet.add(node)
    path.push(node)
    for (const dep of graph[node] ?? []) dfs(dep)
    path.pop()
    pathSet.delete(node)
    visited.add(node)
  }

  for (const key of Object.keys(graph)) dfs(key)
  return cycles
}

// ─── Formula validation ────────────────────────────────────────────────────────

/**
 * Validates a formula string.
 * Checks: syntax, unknown variables, and optionally computes a preview result.
 */
export function validateFormula(
  formula: string,
  knownVars: string[],
  sampleVars: Record<string, number>
): { ok: boolean; error?: string; preview?: number } {
  if (!formula?.trim()) return { ok: false, error: 'Công thức rỗng' }

  let expr
  try {
    expr = parser.parse(formula)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Cú pháp sai: ${msg}` }
  }

  const unknowns = expr.variables().filter((v: string) => !knownVars.includes(v))
  if (unknowns.length) {
    return { ok: false, error: `Biến không xác định: ${unknowns.join(', ')}` }
  }

  const preview = evalFormula(formula, sampleVars)
  if (preview === null) {
    return { ok: false, error: 'Công thức không thể tính được với dữ liệu mẫu' }
  }

  return { ok: true, preview }
}
