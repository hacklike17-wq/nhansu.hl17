# Phase 01 — Formula Engine

**Parent:** `plan.md`
**Dependencies:** Production Migration Phase 3 (API/Service layer) complete
**Research refs:** `research/researcher-01-formula-engine.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Replace unsafe `new Function()` evaluator in `src/lib/formula.ts` with sandboxed `expr-eval`, add dependency-graph resolution (topological sort + circular detection), and wire the correct evaluation order into `calculatePayroll()`.
- **Priority:** Critical
- **Complexity:** M
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Current `evalFormula()` uses `new Function()` — arbitrary code execution if a formula column is ever user-editable; must be fixed before salary config UI is exposed.
- `expr-eval` (~8 KB) is sandboxed: no access to globals, `require`, `process`, or `eval`. Only arithmetic + built-in math functions.
- Formula columns must be evaluated in dependency order, not insertion order. Current `payroll.service.ts` iterates `salaryColumns` ordered by `order` field, which is user-assigned and may not reflect dep graph — silent wrong values result.
- Circular dependency (e.g. `col_a` references `col_b` which references `col_a`) must be detected at save time (Phase 2) AND at eval time (defensive fallback).
- `luong_co_ban / 0` currently returns `0` silently; with `expr-eval` we get `Infinity` — must guard with `isFinite()`.
- `tong_thuc_nhan` (net salary) is derived AFTER insurance and PIT; do NOT evaluate it through the formula engine — compute it explicitly in `calculatePayroll()`.

---

## Requirements

1. `evalFormula(formula, vars)` must NOT use `new Function()` or `eval`.
2. Any formula referencing unknown variable must return `0` and log a warning (not throw).
3. Division by zero must return `0` (not `Infinity` or `NaN`).
4. `buildDependencyGraph(columns)` returns adjacency map `{ colKey: string[] }`.
5. `topologicalSort(graph)` returns ordered `string[]`; throws `CircularDependencyError` on cycle.
6. `detectCircular(graph)` returns `string[][]` of all cycles (for validation UX in Phase 2).
7. `validateFormula(formula, knownVars, sampleVars)` returns `{ ok: boolean; error?: string; preview?: number }`.
8. `calculatePayroll()` evaluates formula columns in topological order, not `order` field order.
9. `tong_thuc_nhan` column (if present in DB) is skipped by formula engine — value set from `netSalary` computed field.
10. Null/empty formula → return `0`, emit `console.warn`.

---

## Architecture

### File changes

```
src/lib/formula.ts          — full replacement
src/lib/services/payroll.service.ts — update evalutation loop
```

### Key pseudocode

```ts
// formula.ts

import { Parser } from 'expr-eval'
const parser = new Parser()

export function evalFormula(formula: string, vars: Record<string, number>): number {
  if (!formula?.trim()) { console.warn('evalFormula: empty formula'); return 0 }
  try {
    const expr = parser.parse(formula)
    const result = expr.evaluate(vars)
    if (typeof result !== 'number' || !isFinite(result)) return 0
    return Math.round(result)
  } catch {
    console.warn('evalFormula error:', formula)
    return 0
  }
}

// Extract referenced variable names from formula string
export function extractVars(formula: string): string[] {
  try {
    return parser.parse(formula).variables()
  } catch {
    return []
  }
}

// Build adjacency graph: colKey → [colKeys it depends on]
export function buildDependencyGraph(
  columns: Array<{ key: string; formula?: string | null; type: string }>
): Record<string, string[]> {
  const colKeys = new Set(columns.map(c => c.key))
  const graph: Record<string, string[]> = {}
  for (const col of columns) {
    if (col.type !== 'formula' || !col.formula) { graph[col.key] = []; continue }
    graph[col.key] = extractVars(col.formula).filter(v => colKeys.has(v))
  }
  return graph
}

class CircularDependencyError extends Error {}

// Returns colKeys in evaluation order (deps first)
export function topologicalSort(graph: Record<string, string[]>): string[] {
  const visited = new Set<string>()
  const visiting = new Set<string>() // in current DFS path
  const result: string[] = []

  function visit(node: string) {
    if (visited.has(node)) return
    if (visiting.has(node)) throw new CircularDependencyError(`Circular: ${node}`)
    visiting.add(node)
    for (const dep of graph[node] ?? []) visit(dep)
    visiting.delete(node)
    visited.add(node)
    result.push(node)
  }

  for (const key of Object.keys(graph)) visit(key)
  return result // deps come before dependents
}

export function validateFormula(
  formula: string,
  knownVars: string[],
  sampleVars: Record<string, number>
): { ok: boolean; error?: string; preview?: number } {
  if (!formula?.trim()) return { ok: false, error: 'Công thức rỗng' }
  let expr
  try { expr = parser.parse(formula) } catch (e: any) {
    return { ok: false, error: `Cú pháp sai: ${e.message}` }
  }
  const unknowns = expr.variables().filter((v: string) => !knownVars.includes(v))
  if (unknowns.length) return { ok: false, error: `Biến không xác định: ${unknowns.join(', ')}` }
  const preview = evalFormula(formula, sampleVars)
  return { ok: true, preview }
}
```

```ts
// payroll.service.ts — updated evaluation section

import { buildDependencyGraph, topologicalSort, evalFormula } from '@/lib/formula'

// Inside calculatePayroll():
const graph = buildDependencyGraph(salaryColumns)
let sortedKeys: string[]
try {
  sortedKeys = topologicalSort(graph)
} catch {
  // Fallback to DB order if circular detected (should be caught at save time)
  sortedKeys = salaryColumns.map(c => c.key)
}

const SKIP_FORMULA_KEYS = new Set(['tong_thuc_nhan'])

for (const key of sortedKeys) {
  const col = salaryColumns.find(c => c.key === key)
  if (!col || col.type !== 'formula' || !col.formula) continue
  if (SKIP_FORMULA_KEYS.has(key)) continue
  vars[key] = evalFormula(col.formula, vars)
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/lib/formula.ts` | Modify | Full replacement — remove `new Function()` |
| `src/lib/services/payroll.service.ts` | Modify | Replace linear loop with topo-sorted eval |
| `package.json` | Modify | Add `expr-eval` dependency |

---

## Implementation Steps

1. `npm install expr-eval` — verify no peer-dep conflicts with React 19.
2. Replace `src/lib/formula.ts` entirely with new implementation (see pseudocode above).
3. Export `extractVars`, `buildDependencyGraph`, `topologicalSort`, `detectCircular`, `validateFormula` from `formula.ts`.
4. In `payroll.service.ts`: import `buildDependencyGraph`, `topologicalSort`. Replace the `for (const col of salaryColumns)` loop with topological-sorted evaluation.
5. Add `SKIP_FORMULA_KEYS` set containing `'tong_thuc_nhan'`; skip those keys in formula loop.
6. Verify `netSalary` is still computed explicitly: `grossSalary - bhxhEmployee - bhytEmployee - bhtnEmployee - pitTax`.
7. Manual smoke test: create a formula column `tien_tang_ca = gio_tang_ca * luong_co_ban / 26 / 8 * 1.5` and verify result matches manual calc.

---

## Todo List

- [ ] Install `expr-eval` package
- [ ] Rewrite `src/lib/formula.ts` — remove `new Function()`
- [ ] Add `extractVars()` using `expr-eval` `.variables()`
- [ ] Add `buildDependencyGraph()`
- [ ] Add `topologicalSort()` with visiting-set cycle detection
- [ ] Add `detectCircular()` returning all cycles
- [ ] Add `validateFormula()` with syntax + unknown var + preview checks
- [ ] Update `payroll.service.ts` evaluation loop to use topological sort
- [ ] Add `SKIP_FORMULA_KEYS` guard for `tong_thuc_nhan`
- [ ] Confirm `netSalary` formula: `grossSalary - bhxh - bhyt - bhtn - pitTax`

---

## Success Criteria

- `evalFormula('luong_co_ban / 0', { luong_co_ban: 10000000 })` returns `0`.
- `evalFormula('process.exit(0)', {})` throws/returns `0` (no side effect).
- `topologicalSort` on `{ b: ['a'], a: [] }` returns `['a', 'b']`.
- `topologicalSort` on `{ a: ['b'], b: ['a'] }` throws `CircularDependencyError`.
- `validateFormula('luong_co_ban * 2', ['luong_co_ban'], { luong_co_ban: 5000000 })` returns `{ ok: true, preview: 10000000 }`.
- `calculatePayroll()` with formula column depending on another formula column produces correct result regardless of DB `order` field.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `expr-eval` API differs from expected | Low | Medium | Read `node_modules/next/dist/docs/` + expr-eval README before coding |
| Existing formula strings incompatible with expr-eval parser | Low | High | Test all existing formulas in DB against new parser before deploy |
| Topological sort performance on large column sets | Very Low | Low | Column count typically <20; O(n) is fine |
| Silent fallback hides circular dep bugs | Medium | Medium | Log warning to console on topo-sort failure |

---

## Security Considerations

- `expr-eval` is sandboxed — no globals, no require, no fs. Verify this against expr-eval changelog for the installed version.
- Formula strings come from DB (written by admins), not from end-users. Still, never fall back to `new Function()` even for legacy records.
- `companyId` must be validated from session in all callers — formula engine itself is company-agnostic.

---

## Next Steps

- Phase 2 calls `validateFormula()` server-side on SalaryColumn save.
- Phase 2 calls `detectCircular()` to block saving circular formulas.
