---
# Research: Safe Formula Evaluation & Dependency Resolution
**For:** Payroll Upgrade — Phase 1 (Formula Engine)
**Date:** 2026-04-12
---

## 1. Library Recommendations

| Library | Safety | Size | Notes |
|---------|--------|------|-------|
| **expr-eval** | ★★★★★ | ~8KB | Sandboxed, no `Function()`, compiles once |
| math.js | ★★★★★ | ~90KB | Overkill for arithmetic only |
| math-expression-evaluator | ★★★★ | ~15KB | Fastest but less features |
| jexl | ★★★ | Medium | Supports complex logic, overkill |

**Decision:** Use `expr-eval`. Replaces `new Function()` with sandboxed compile+evaluate.

```typescript
import { compile } from 'expr-eval'

export function evalFormula(formula: string, vars: Record<string, number>): number {
  if (!formula.trim()) return 0
  try {
    const expr = compile(formula)
    const result = expr.evaluate(vars)
    if (typeof result === 'number' && isFinite(result)) return Math.round(result)
    return 0
  } catch { return 0 }
}
```

Install: `npm install expr-eval`

---

## 2. Dependency Graph + Topological Sort

**Parse vars from formula:** `formula.matchAll(/\b([a-z_][a-z0-9_]*)\b/gi)`

**Kahn's algorithm (DFS-based):**

```typescript
function topologicalSort(formulas: Record<string, string>): string[] | null {
  const graph = buildGraph(formulas) // key → Set<depKeys>
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(node: string): boolean {
    if (visited.has(node)) return true
    if (visiting.has(node)) return false // CYCLE
    visiting.add(node)
    for (const dep of graph[node] ?? []) {
      if (!visit(dep)) return false
    }
    visiting.delete(node)
    visited.add(node)
    sorted.push(node)
    return true
  }

  for (const key of Object.keys(formulas)) {
    if (!visit(key)) return null // null = cycle detected
  }
  return sorted
}
```

No external library needed for this.

---

## 3. Circular Dependency Detection

Built into topological sort above (`visiting` set).

Report cycle path for UX:
```typescript
function findCyclePath(graph, start): string[] | null {
  const path: string[] = []
  const visiting = new Set<string>()
  function dfs(node: string): boolean {
    visiting.add(node); path.push(node)
    for (const dep of graph[node] ?? []) {
      if (visiting.has(dep)) return true
      if (dfs(dep)) return true
    }
    path.pop(); visiting.delete(node)
    return false
  }
  dfs(start)
  return path.length > 0 ? path : null
}
```

---

## 4. Formula Validation Pattern

Validate in sequence: syntax → undefined vars → division by zero → result type.

```typescript
interface ValidationResult { valid: boolean; errors: string[] }

function validateFormula(
  formula: string,
  knownVars: Set<string>,
  sampleVars?: Record<string, number>
): ValidationResult {
  const errors: string[] = []
  try {
    const compiled = compile(formula)
    const used = extractVars(formula)
    for (const v of used) {
      if (!knownVars.has(v)) errors.push(`Biến không tồn tại: ${v}`)
    }
    const testVars = { ...Object.fromEntries([...knownVars].map(k => [k, 1])), ...sampleVars }
    const result = compiled.evaluate(testVars)
    if (!Number.isFinite(result)) errors.push('Công thức cho kết quả không hợp lệ')
  } catch (e) {
    errors.push(`Lỗi cú pháp: ${(e as Error).message}`)
  }
  return { valid: errors.length === 0, errors }
}
```

---

## Gaps in Current `src/lib/formula.ts`

1. Uses `new Function()` — security risk, CSP-blocked environments
2. No dependency resolution — formulas evaluated in DB order, wrong if dependencies exist
3. No circular detection — silently returns 0
4. No validation — null formulas accepted, bad formulas pass through
5. No support for conditional logic (IF/MIN/MAX) — may be needed for KPI bonuses
