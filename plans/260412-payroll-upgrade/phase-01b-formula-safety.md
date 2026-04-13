# Phase 01b — Formula Safety Contract

**Parent:** `plan.md`
**Dependencies:** Phase 01 (formula engine — expr-eval installed, topological sort working)
**Inserts after:** Phase 01
**Research refs:** `research/researcher-01-formula-engine.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Define and enforce the explicit error contract for `evalFormula()` and the formula evaluation loop in `calculatePayroll()`. Ensure that one bad formula never crashes the payroll calculation, propagation of error values into dependent columns is handled predictably, and errors are surfaced to the admin rather than silently producing 0.
- **Priority:** Critical
- **Complexity:** S
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Phase 01 wraps `evalFormula()` in try/catch and returns `0` on error — **this is incomplete**. If column B's formula is `col_a + 1000` and `col_a` errors, `vars.col_a` will be `0`, making B silently compute a wrong value with no indication anything failed.
- The correct contract: on formula error, mark that column as **`null` (not `0`)** in the vars map, and skip injecting it into downstream columns. Downstream columns that reference it via formula produce `null`-propagation errors which are also caught.
- `0` is a **valid payroll value** (e.g., no phụ cấp this month = 0). Using `0` as the error sentinel is ambiguous and hides bugs. Use `null` internally during evaluation, then substitute `0` when writing to DB.
- Errors per column must be **collected** and stored alongside the Payroll row so admins can see exactly which formula failed during which payroll run — not just a console.warn.
- Crash prevention rule: `calculatePayroll()` must **never throw** to the Server Action caller — it must always return a result (possibly with errors), and the Server Action decides whether to save or reject.

---

## Requirements

1. `evalFormula(formula, vars)` returns `number | null` — `null` = evaluation failed (syntax error, unknown var, Infinity, NaN, division by zero). `0` = formula evaluated to zero legitimately.
2. In the topological sort evaluation loop, if `evalFormula()` returns `null` for column `col_a`:
   - `vars.col_a` is NOT set (key absent from vars map)
   - All subsequent columns that reference `col_a` in their formula will also fail → return `null` → not set in vars
   - This cascade is intentional and correct — it surfaces the root cause column.
3. `calculatePayroll()` collects all column evaluation errors into `FormulaError[]`:
   ```typescript
   interface FormulaError {
     columnKey: string
     columnName: string
     formula: string
     reason: string // 'syntax' | 'undefined_var' | 'division_zero' | 'infinite' | 'cascade'
   }
   ```
4. `FormulaError[]` stored in `Payroll.anomalies` (reuse Phase 09's `anomalies Json?` field — formula errors are a type of anomaly with severity `'error'`).
5. `calculatePayroll()` returns `{ payroll: Payroll; formulaErrors: FormulaError[] }` — never throws.
6. Server Action `generateMonthPayroll()` / `recalculateMonthPayroll()`: if `formulaErrors.length > 0`, still **saves** the payroll (with best-effort values for unaffected columns), but marks it with errors in `anomalies`.
7. Admin sees formula error icons in PayrollTable (reuses Phase 09 anomaly icon component) with error detail: "Cột `tien_tang_ca`: công thức lỗi — biến `gio_tang_ca` không tồn tại".
8. `toPending()` Server Action: blocks if any `formulaErrors` of severity `'error'` exist in `anomalies` — same check as Phase 09 anomaly guard.

---

## Architecture

### evalFormula return type change

```typescript
// src/lib/formula.ts

import { Parser } from 'expr-eval'
const parser = new Parser()

/**
 * Returns the evaluated number, or null if evaluation failed for any reason.
 * null ≠ 0 — null means "this formula did not produce a valid result".
 */
export function evalFormula(formula: string, vars: Record<string, number>): number | null {
  if (!formula?.trim()) return null

  try {
    const expr = parser.parse(formula)
    // Only inject vars that are present (skip undefined-var columns from cascade)
    const result = expr.evaluate(vars)
    if (typeof result !== 'number' || !isFinite(result)) return null
    return Math.round(result)
  } catch {
    return null
  }
}
```

### Formula evaluation loop with cascade protection

```typescript
// payroll.service.ts — inside calculatePayroll(), replace the current loop

interface FormulaError {
  columnKey: string
  columnName: string
  formula: string
  reason: 'syntax_error' | 'undefined_var' | 'cascade' | 'invalid_result'
}

const formulaErrors: FormulaError[] = []

for (const key of sortedKeys) {
  const col = salaryColumns.find(c => c.key === key)
  if (!col || col.type !== 'formula' || !col.formula) continue
  if (SKIP_FORMULA_KEYS.has(key)) continue

  // Check if any dependency of this column errored (cascade detection)
  const deps = graph[key] ?? []
  const hasCascadeDep = deps.some(dep => !(dep in vars))

  if (hasCascadeDep) {
    formulaErrors.push({
      columnKey: key,
      columnName: col.name,
      formula: col.formula,
      reason: 'cascade',
    })
    // Do NOT set vars[key] — absence propagates the cascade
    continue
  }

  const result = evalFormula(col.formula, vars)

  if (result === null) {
    formulaErrors.push({
      columnKey: key,
      columnName: col.name,
      formula: col.formula,
      reason: 'invalid_result',
    })
    // Do NOT set vars[key]
    continue
  }

  vars[key] = result
}
```

### calculatePayroll return type

```typescript
// payroll.service.ts
export async function calculatePayroll(
  companyId: string,
  employeeId: string,
  month: Date,
): Promise<{ payroll: Payroll; formulaErrors: FormulaError[] }> {
  // ... existing logic ...

  // Map vars back to Payroll fields — missing vars default to 0 for storage
  const payrollData = {
    workSalary:   vars['work_salary']   ?? 0,
    tienPhuCap:   vars['phu_cap']       ?? 0,
    overtimePay:  vars['overtime_pay']  ?? 0,
    // ... etc
    grossSalary:  vars['gross_salary']  ?? (baseSalary), // fallback to baseSalary
    // netSalary computed explicitly after all vars are resolved
  }

  // Collect formula errors as anomalies
  const existingAnomalies = checkPayrollAnomalies(payrollData, prevPayroll) // Phase 09
  const allAnomalies = [
    ...existingAnomalies,
    ...formulaErrors.map(e => ({
      rule: `FORMULA_ERROR_${e.columnKey.toUpperCase()}`,
      severity: 'error' as const,
      message: `Cột "${e.columnName}": ${e.reason === 'cascade' ? 'phụ thuộc vào cột bị lỗi' : 'công thức không hợp lệ'}`,
    })),
  ]

  const payroll = await db.payroll.upsert({
    // ...
    update: { ...payrollData, anomalies: allAnomalies as unknown as Prisma.JsonArray },
    create: { ...payrollData, anomalies: allAnomalies as unknown as Prisma.JsonArray },
  })

  return { payroll, formulaErrors }
}
```

### Never throw from calculatePayroll

```typescript
// payroll.service.ts — wrap entire calculatePayroll in outer try/catch
export async function calculatePayroll(...): Promise<{ payroll: Payroll | null; formulaErrors: FormulaError[] }> {
  try {
    // ... all existing logic ...
    return { payroll, formulaErrors }
  } catch (err) {
    // Catastrophic DB error — don't crash Server Action, return error state
    console.error('calculatePayroll catastrophic error:', err)
    return {
      payroll: null,
      formulaErrors: [{
        columnKey: '__system__',
        columnName: 'Hệ thống',
        formula: '',
        reason: 'syntax_error',
      }],
    }
  }
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/lib/formula.ts` | Modify | `evalFormula` returns `number \| null` |
| `src/lib/services/payroll.service.ts` | Modify | Cascade-safe loop + FormulaError collection + never-throw wrapper |
| `src/app/luong/actions.ts` | Modify | Handle `payroll: null` case from calculatePayroll |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Show formula error icons (reuse Phase 09 anomaly icons) |

---

## Implementation Steps

1. Change `evalFormula()` return type to `number | null` — update all callers (only `payroll.service.ts` should be calling this).
2. Update topological evaluation loop: if `evalFormula()` returns `null`, push to `formulaErrors`, do NOT set `vars[key]`.
3. Add cascade detection: before evaluating a column, check if any dep key is absent from `vars`.
4. Wrap entire `calculatePayroll()` in outer try/catch → return `{ payroll: null, formulaErrors }` on catastrophic failure.
5. Update `calculatePayroll()` return type to `Promise<{ payroll: Payroll | null; formulaErrors: FormulaError[] }>`.
6. Merge `formulaErrors` into `anomalies` array before upsert.
7. Update all `generateMonthPayroll()` / `recalculateMonth()` callers: handle `payroll: null` case — log error, skip that employee, continue with others.
8. Update `PayrollTable.tsx`: show error icon for rows with formula errors in anomalies (already handled by Phase 09 anomaly icon — just ensure formula errors follow same severity format).

---

## Todo List

- [ ] Change evalFormula return: `number | null`
- [ ] Update evaluation loop: null → collect FormulaError, do NOT set vars[key]
- [ ] Add cascade detection per column (check deps present in vars)
- [ ] Outer try/catch in calculatePayroll — never throw
- [ ] Update return type: `{ payroll: Payroll | null; formulaErrors: FormulaError[] }`
- [ ] Merge formula errors into anomalies before upsert
- [ ] Update generateMonthPayroll: skip null payroll employees, continue others
- [ ] Test: col A formula error → col B (depends on A) also fails with reason='cascade'
- [ ] Test: calculatePayroll never throws even with completely broken formulas
- [ ] Test: Payroll row still saved with correct unaffected columns even when some formulas fail

---

## Success Criteria

- `evalFormula('1/0', {})` returns `null` (not `0`, not `Infinity`).
- `evalFormula('valid_col + 1', { valid_col: 100 })` returns `101` (not null).
- If `col_a` formula errors → `vars.col_a` absent → `col_b = col_a + 500` also fails with `reason: 'cascade'`.
- `calculatePayroll()` with 3 broken formulas: returns `{ payroll: <saved row>, formulaErrors: [3 items] }` — DOES NOT throw, DOES save.
- `Payroll.anomalies` contains formula error entries visible in PayrollTable.
- `toPending()` blocked when `formulaErrors` present in anomalies.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Callers expect `number` return from evalFormula | High | Medium | Search all usages before changing signature |
| `null` cascades too aggressively — unrelated columns fail | Low | Medium | Only cascade to direct dependents (graph check), not all columns |
| Catastrophic outer catch hides real DB errors | Low | Low | Log full error + stack to console; bubble up to monitoring |

---

## Security Considerations

- No security surface change — formula evaluation is already sandboxed (Phase 01).
- Formula errors visible in UI require `luong.view` permission — same as payroll table.

---

## Next Steps

Phase 02 (Salary Config UI) calls `validateFormula()` at save time — this phase ensures that even formulas that pass validation can fail gracefully at runtime if data context changes.
