# Phase 02 — Salary Config UI

**Parent:** `plan.md`
**Dependencies:** Phase 01 (formula engine — `validateFormula`, `detectCircular`)
**Research refs:** `research/researcher-01-formula-engine.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Upgrade the SalaryColumn configuration UI from a raw text input to a structured formula builder. Add server-side validation, circular dep detection, and a preview result panel.
- **Priority:** Critical
- **Complexity:** M
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Current UI likely lets users type variable names by hand — typos silently produce wrong payrolls.
- Replacing the formula input with a variable-insertion dropdown guarantees only valid, known variable names are used.
- Validation must run **server-side** in the Server Action (not just client-side) — client can always be bypassed.
- Preview should use a representative sample employee's real data from DB (not hardcoded dummy values), so admins trust the result.
- Columns with `isSystem: true` should not be editable — guard in Server Action and disable in UI.
- `key` field is immutable after creation — changing it would break all existing `SalaryValue` records.

---

## Requirements

1. Formula text input replaced by: text input + variable picker dropdown.
2. Variable picker lists all available variables: system vars (`luong_co_ban`, `cong_so_nhan`, `net_cong_so`, `gio_tang_ca`, `kpi_score`) + all non-system SalaryColumn keys.
3. Clicking a variable in the picker inserts it at current cursor position in the formula input.
4. On save, Server Action validates:
   - Syntax via `validateFormula()`
   - Unknown variables (formula uses vars not in known list)
   - Circular dependency via `detectCircular()` across ALL company columns
   - Division-by-zero with sample data
5. On validation error → return `{ ok: false, error: string }` — do NOT save to DB.
6. Preview panel: shows formula result using first active employee's real data for current month.
7. System columns (`isSystem: true`) are rendered read-only; Save button hidden.
8. `key` field disabled in edit mode (immutable).
9. Column `type` must be set: `'number'` (manual input) or `'formula'` (computed). Formula field only shown for `type === 'formula'`.

---

## Architecture

### File structure

```
src/app/caidat/
  page.tsx                    ← Server Component (already exists — extend)
  actions.ts                  ← Add: saveSalaryColumn, deleteSalaryColumn
  components/
    SalaryColumnTable.tsx     ← 'use client' — list columns, open modal
    SalaryColumnModal.tsx     ← 'use client' — formula builder form
    FormulaInput.tsx          ← 'use client' — input + variable picker dropdown
    FormulaPreview.tsx        ← 'use client' — calls /api/salary/preview

src/app/api/salary/
  preview/route.ts            ← GET — evalFormula with sample employee, returns { preview: number }

src/lib/schemas/
  salary.ts                   ← Zod schemas: CreateSalaryColumnSchema, UpdateSalaryColumnSchema
```

### FormulaInput component

```tsx
// FormulaInput.tsx — 'use client'
const SYSTEM_VARS = [
  { key: 'luong_co_ban',   label: 'Lương cơ bản' },
  { key: 'cong_so_nhan',   label: 'Công số nhận' },
  { key: 'cong_so_tru',    label: 'Công số trừ' },
  { key: 'net_cong_so',    label: 'Công thực tế' },
  { key: 'gio_tang_ca',    label: 'Giờ tăng ca' },
  { key: 'kpi_score',      label: 'KPI Score' },
]

export function FormulaInput({ value, onChange, columns, readOnly }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const allVars = [
    ...SYSTEM_VARS,
    ...columns.filter(c => c.type === 'formula').map(c => ({ key: c.key, label: c.name }))
  ]

  function insertVar(varKey: string) {
    const el = inputRef.current!
    const { selectionStart: s, selectionEnd: e } = el
    const next = value.slice(0, s!) + varKey + value.slice(e!)
    onChange(next)
    // restore cursor after inserted var
    setTimeout(() => el.setSelectionRange(s! + varKey.length, s! + varKey.length))
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} value={value} onChange={e => onChange(e.target.value)} readOnly={readOnly}
        className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
      <div className="flex flex-wrap gap-1">
        {allVars.map(v => (
          <button key={v.key} type="button" onClick={() => insertVar(v.key)}
            className="px-2 py-0.5 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded">
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

### Server Action — saveSalaryColumn

```typescript
// caidat/actions.ts
'use server'
import { validateFormula, detectCircular, buildDependencyGraph } from '@/lib/formula'

export async function saveSalaryColumn(formData: FormData) {
  const session = await auth()
  if (!session || !hasPermission(session.user.permissions, 'caidat.edit')) {
    return { ok: false, error: 'Không có quyền' }
  }

  const parsed = SaveSalaryColumnSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: 'Dữ liệu không hợp lệ' }

  const { key, name, type, formula, order } = parsed.data
  const companyId = session.user.companyId!

  if (type === 'formula') {
    // 1. Get all existing columns for this company
    const allColumns = await db.salaryColumn.findMany({ where: { companyId } })
    const knownVars = [
      ...SYSTEM_VARS_KEYS,
      ...allColumns.map(c => c.key),
    ]

    // 2. Validate syntax + unknown vars + preview
    const validation = validateFormula(formula ?? '', knownVars, SAMPLE_VARS)
    if (!validation.ok) return { ok: false, error: validation.error }

    // 3. Detect circular dependency (include current column being saved)
    const allWithNew = [...allColumns.filter(c => c.key !== key), { key, formula, type }]
    const graph = buildDependencyGraph(allWithNew)
    const cycles = detectCircular(graph)
    if (cycles.length > 0) {
      return { ok: false, error: `Vòng lặp phụ thuộc: ${cycles[0].join(' → ')}` }
    }
  }

  await db.salaryColumn.upsert({
    where: { companyId_key: { companyId, key } },
    update: { name, type, formula: type === 'formula' ? formula : null, order },
    create: { companyId, key, name, type, formula: type === 'formula' ? formula : null, order },
  })

  revalidateTag(`salary-columns-${companyId}`)
  return { ok: true }
}
```

### Preview API endpoint

```typescript
// api/salary/preview/route.ts
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const formula = searchParams.get('formula') ?? ''
  const companyId = session.user.companyId!

  // Fetch first active employee's real data for current month
  const employee = await db.employee.findFirst({ where: { companyId, deletedAt: null } })
  if (!employee) return ok({ preview: 0 })

  const month = new Date()
  const vars = await buildVarsForEmployee(companyId, employee.id, month)
  const knownVars = Object.keys(vars)
  const result = validateFormula(formula, knownVars, vars)
  return ok(result)
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/app/caidat/page.tsx` | Modify | Add SalaryColumnTable section |
| `src/app/caidat/actions.ts` | Modify | Add saveSalaryColumn + deleteSalaryColumn |
| `src/app/caidat/components/SalaryColumnTable.tsx` | Create | 'use client' |
| `src/app/caidat/components/SalaryColumnModal.tsx` | Create | 'use client' |
| `src/app/caidat/components/FormulaInput.tsx` | Create | 'use client' — var picker |
| `src/app/caidat/components/FormulaPreview.tsx` | Create | 'use client' — fetch preview |
| `src/app/api/salary/preview/route.ts` | Create | GET — formula preview |
| `src/lib/schemas/salary.ts` | Create | Zod: SaveSalaryColumnSchema |

---

## Implementation Steps

1. Define `SYSTEM_VARS_KEYS` constant: `['luong_co_ban', 'cong_so_nhan', 'cong_so_tru', 'net_cong_so', 'gio_tang_ca', 'kpi_score']` in `src/constants/data.ts` or a new `src/constants/salary.ts`.
2. Write `src/lib/schemas/salary.ts` with `SaveSalaryColumnSchema` (Zod).
3. Write `src/app/caidat/actions.ts:saveSalaryColumn` (see pseudocode above).
4. Write `src/app/api/salary/preview/route.ts`.
5. Write `FormulaInput.tsx` component with cursor-position insertion.
6. Write `SalaryColumnModal.tsx` — form with FormulaInput, type selector, name/key/order fields.
7. Write `SalaryColumnTable.tsx` — list columns, open modal for create/edit, show type/formula/order.
8. Update `src/app/caidat/page.tsx` — fetch `salaryColumns` from DB, pass to `SalaryColumnTable`.
9. Add `deleteSalaryColumn` Server Action — block delete of `isSystem: true` columns.
10. Test: save formula with unknown var → get error. Save valid formula → saved to DB. Save circular formula → get cycle error.

---

## Todo List

- [ ] Define `SYSTEM_VARS_KEYS` and `SAMPLE_VARS` constants
- [ ] Write `SaveSalaryColumnSchema` Zod schema
- [ ] Write `saveSalaryColumn` Server Action with full validation
- [ ] Write `deleteSalaryColumn` Server Action (guard isSystem)
- [ ] Create `GET /api/salary/preview` route
- [ ] Create `FormulaInput.tsx` with variable picker
- [ ] Create `SalaryColumnModal.tsx`
- [ ] Create `SalaryColumnTable.tsx`
- [ ] Update `caidat/page.tsx` to fetch + display salary columns
- [ ] Test: unknown var → error message shown
- [ ] Test: circular dep → error message shown
- [ ] Test: preview shows real number from employee data

---

## Success Criteria

- Saving formula `luong_co_ban * invalid_var` returns error "Biến không xác định: invalid_var".
- Saving formula where col A = `col_B + 1` and col B = `col_A + 1` returns circular dep error.
- Clicking a variable in the picker inserts it at cursor position in formula input.
- Preview panel shows numeric result (not 0 for a valid formula with real employee data).
- System columns (`isSystem: true`) cannot be edited — Save button hidden, fields disabled.
- After save: `SalaryColumn` row in DB has correct `formula` and `type` values.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Formula with column keys that don't exist yet (created after) | Medium | Low | Re-validate on payroll generate; columns loaded dynamically |
| Preview uses stale employee data | Low | Low | Preview is for approximate trust — label "Kết quả ước tính" |
| Cursor position in formula input breaks on mobile | Low | Low | Defer mobile optimization to later |

---

## Security Considerations

- `caidat.edit` permission required for save/delete. `boss_admin` and `admin` only.
- `key` field must not be writable on update (upsert uses fixed `companyId_key` — key comes from DB record, not form).
- Preview endpoint: companyId from session, never from query string.
- `formula` goes through `validateFormula()` before DB write — prevents injection into `expr-eval`.

---

## Next Steps

Phase 3 uses the validated columns to auto-trigger payroll recalculation when attendance data changes.
