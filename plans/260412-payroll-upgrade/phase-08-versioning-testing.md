# Phase 08 — Versioning & Testing

**Parent:** `plan.md`
**Dependencies:** Phase 07 (LOCKED status + audit), Phase 02 (formula validation)
**Research refs:** `research/researcher-02-payroll-workflow.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Implement formula version history (SalaryColumnVersion) so historical payrolls can be recalculated with the formulas active at that time. Add unit tests for the formula engine, payroll calculation, and the attendance→payroll sync chain.
- **Priority:** Medium
- **Complexity:** L
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Without versioning, changing a formula today retroactively changes how old payrolls would be recalculated — a compliance and audit risk.
- `SalaryColumnVersion` snapshots the formula at the moment of each save. `calculatePayroll()` fetches the version active at the payroll's month, not the current live formula.
- The current `SalaryColumn` row remains the "live/current" config. Versions are append-only historical records.
- Vitest is the recommended test runner for Next.js projects (fast, ESM-native). Jest also works.
- Tests do NOT need a real DB — mock Prisma with `vitest-mock-extended` or `@prisma/client/testing`.
- Key test cases: (a) formula engine correctness, (b) topological sort + circular detection, (c) full `calculatePayroll()` with known inputs and expected output, (d) attendance change triggers payroll recalc.

---

## Requirements

1. New `SalaryColumnVersion` model in Prisma with `effectiveFrom DateTime @db.Date`.
2. When `saveSalaryColumn()` saves a formula, it also creates a `SalaryColumnVersion` snapshot.
3. `calculatePayroll(companyId, employeeId, month)` fetches column versions active at `month`, not current columns.
4. Version lookup: `SalaryColumnVersion` where `effectiveFrom <= month`, ordered by `effectiveFrom DESC`, take first per `columnKey`.
5. If no version exists for a column at that month: fall back to current `SalaryColumn.formula`.
6. Vitest (or Jest) test suite:
   - `formula.test.ts`: evalFormula, extractVars, buildDependencyGraph, topologicalSort (cycle + no-cycle), validateFormula
   - `payroll.test.ts`: calculatePayroll with known inputs, PIT calculation, insurance calculation
   - `sync.test.ts`: mock DB, simulate WorkUnit change → verify calculatePayroll is called for employee's DRAFT payroll

---

## Architecture

### Schema change

```prisma
model SalaryColumnVersion {
  id            String   @id @default(cuid())
  companyId     String
  columnKey     String
  name          String
  formula       String?
  type          String
  effectiveFrom DateTime @db.Date
  createdAt     DateTime @default(now())
  createdBy     String?

  @@unique([companyId, columnKey, effectiveFrom])
  @@index([companyId, columnKey, effectiveFrom])
  @@map("salary_column_versions")
}
```

### saveSalaryColumn: create version on save

```typescript
// caidat/actions.ts — add to saveSalaryColumn after upsert
await db.salaryColumnVersion.create({
  data: {
    companyId,
    columnKey: parsed.data.key,
    name: parsed.data.name,
    formula: parsed.data.formula ?? null,
    type: parsed.data.type,
    effectiveFrom: startOfMonth(new Date()), // effective from current month
    createdBy: session.user.id,
  },
})
```

### calculatePayroll: fetch versioned formulas

```typescript
// payroll.service.ts
async function getColumnsForMonth(companyId: string, month: Date) {
  // Get all column versions active at this month (latest version per key)
  const versions = await db.salaryColumnVersion.findMany({
    where: {
      companyId,
      effectiveFrom: { lte: startOfMonth(month) },
    },
    orderBy: { effectiveFrom: 'desc' },
  })

  // Deduplicate: take latest version per columnKey
  const latestPerKey = new Map<string, typeof versions[0]>()
  for (const v of versions) {
    if (!latestPerKey.has(v.columnKey)) latestPerKey.set(v.columnKey, v)
  }

  // Fallback: merge with current SalaryColumn for keys without any version
  const current = await db.salaryColumn.findMany({ where: { companyId } })
  const result = current.map(col => {
    const version = latestPerKey.get(col.key)
    return version ? { ...col, formula: version.formula, name: version.name } : col
  })

  return result
}
```

### Test suite structure

```
src/
  lib/
    __tests__/
      formula.test.ts
      payroll.test.ts
      sync.test.ts
```

### formula.test.ts

```typescript
import { describe, it, expect } from 'vitest'
import { evalFormula, buildDependencyGraph, topologicalSort, validateFormula } from '../formula'

describe('evalFormula', () => {
  it('evaluates basic arithmetic', () => {
    expect(evalFormula('luong_co_ban * net_cong_so / 26', {
      luong_co_ban: 10_000_000, net_cong_so: 26,
    })).toBe(10_000_000)
  })

  it('returns 0 for empty formula', () => {
    expect(evalFormula('', {})).toBe(0)
  })

  it('returns 0 for division by zero', () => {
    expect(evalFormula('luong_co_ban / 0', { luong_co_ban: 5_000_000 })).toBe(0)
  })

  it('does NOT execute process.exit', () => {
    expect(() => evalFormula('process.exit(0)', {})).not.toThrow()
    expect(evalFormula('process.exit(0)', {})).toBe(0)
  })
})

describe('topologicalSort', () => {
  it('sorts deps before dependents', () => {
    const graph = { b: ['a'], a: [], c: ['b', 'a'] }
    const sorted = topologicalSort(graph)
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'))
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'))
  })

  it('throws on circular dependency', () => {
    const graph = { a: ['b'], b: ['a'] }
    expect(() => topologicalSort(graph)).toThrow('Circular')
  })
})

describe('validateFormula', () => {
  const knownVars = ['luong_co_ban', 'net_cong_so']

  it('returns ok=true for valid formula', () => {
    const result = validateFormula('luong_co_ban * 2', knownVars, { luong_co_ban: 5_000_000, net_cong_so: 20 })
    expect(result.ok).toBe(true)
    expect(result.preview).toBe(10_000_000)
  })

  it('returns error for unknown variable', () => {
    const result = validateFormula('unknown_var + 1', knownVars, {})
    expect(result.ok).toBe(false)
    expect(result.error).toContain('unknown_var')
  })

  it('returns error for syntax error', () => {
    const result = validateFormula('luong_co_ban ** ** 2', knownVars, {})
    expect(result.ok).toBe(false)
  })
})
```

### payroll.test.ts (with mocked DB)

```typescript
import { describe, it, expect, vi } from 'vitest'
// Mock prisma db
vi.mock('@/lib/db', () => ({ db: mockDb }))

describe('calculatePayroll', () => {
  it('computes netSalary correctly for known inputs', async () => {
    // Setup: employee with baseSalary=10M, 26 work units, no deductions, no overtime
    // Formula: work_salary = luong_co_ban * net_cong_so / 26
    // Insurance: BHXH=8%, BHYT=1.5%, BHTN=1%
    // PIT: 0 (taxable income below 11M personal deduction)
    // Expected net: 10M - 0 insurance (if gross < threshold) - 0 PIT = ~10M

    const result = await calculatePayroll('company1', 'emp1', new Date('2026-04-01'))
    expect(result.grossSalary).toBe(10_000_000)
    expect(result.netSalary).toBeGreaterThan(0)
    expect(result.netSalary).toBeLessThanOrEqual(result.grossSalary)
  })
})
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | Modify | Add SalaryColumnVersion model |
| `prisma/migrations/` | Create | Migration for new model |
| `src/app/caidat/actions.ts` | Modify | Create version snapshot on column save |
| `src/lib/services/payroll.service.ts` | Modify | Add getColumnsForMonth(), use versioned formulas |
| `src/lib/__tests__/formula.test.ts` | Create | Unit tests for formula engine |
| `src/lib/__tests__/payroll.test.ts` | Create | Unit tests for payroll calculation |
| `src/lib/__tests__/sync.test.ts` | Create | Integration test: attendance change → recalc |
| `package.json` | Modify | Add vitest + @vitest/coverage-v8 devDependencies |

---

## Implementation Steps

1. Add `SalaryColumnVersion` to `schema.prisma`.
2. Run `npx prisma migrate dev --name add_salary_column_versions`.
3. Update `saveSalaryColumn()` to create a version snapshot after upsert.
4. Write `getColumnsForMonth(companyId, month)` in `payroll.service.ts`.
5. Update `calculatePayroll()` to call `getColumnsForMonth()` instead of `findMany` on current columns.
6. Install Vitest: `npm install -D vitest @vitest/coverage-v8 vitest-mock-extended`.
7. Add `vitest.config.ts` to project root (or configure in `package.json`).
8. Write `formula.test.ts` — run `npx vitest run` after each function.
9. Write `payroll.test.ts` with mocked Prisma — test known-input/expected-output.
10. Write `sync.test.ts` — verify `calculatePayroll` is called when WorkUnit changes.
11. Add `npm run test` to `package.json` scripts.

---

## Todo List

- [ ] Add SalaryColumnVersion model to schema
- [ ] Run migration
- [ ] Update saveSalaryColumn to create version snapshot
- [ ] Write getColumnsForMonth() service function
- [ ] Update calculatePayroll to use versioned columns
- [ ] Install vitest + dependencies
- [ ] Write formula.test.ts (evalFormula, topo sort, validateFormula)
- [ ] Write payroll.test.ts (calculatePayroll with known inputs)
- [ ] Write sync.test.ts (attendance → payroll recalc)
- [ ] Add test script to package.json
- [ ] Verify all tests pass: npx vitest run

---

## Success Criteria

- Changing a formula in April 2026 does NOT change how a March 2026 payroll recalculates.
- `getColumnsForMonth(companyId, new Date('2026-03-01'))` returns March formulas, not April formulas.
- All formula tests pass: 0/0 = 0, circular = error, unknown var = error.
- Known-input payroll test: baseSalary=10M, 26 days → netSalary ≈ expected value with correct insurance + PIT.
- `npm run test` exits 0.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| No version exists for historical months | Medium | Medium | Fall back to current SalaryColumn.formula |
| Test mocks diverge from real Prisma behavior | Medium | Medium | Add one real integration test using test DB (optional) |
| Vitest config conflicts with Next.js 16 | Low | Medium | Use `vitest.config.ts` with `environment: 'node'` for service tests |

---

## Security Considerations

- SalaryColumnVersion is append-only — no update/delete operations exposed.
- Tests run in isolated mock environment — no access to production DB.

---

## Next Steps

Phase 9 adds anomaly detection (negative salary, unusual attendance) and Excel export.
