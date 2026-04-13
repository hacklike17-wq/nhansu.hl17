# Phase 06 — System Standardization

**Parent:** `plan.md`
**Dependencies:** Phase 01 (formula engine), Phase 03 (data sync), Phase 05 (manual inputs)

---

## Overview

- **Date:** 2026-04-12
- **Description:** Standardize variable names, enforce backend-only calculation, audit the frontend for any client-side payroll math, and document the canonical variable contract used by the formula engine.
- **Priority:** High
- **Complexity:** M
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- After Phases 1–5, calculation should already be backend-only. This phase is the audit + cleanup pass that ensures nothing slipped through.
- Variable names are the API contract between formula configuration and the calculation engine. Any inconsistency (e.g., formula says `cong_so` but engine provides `net_cong_so`) silently produces 0. Must be documented and enforced.
- `src/constants/data.ts` currently holds all seed data — it will be slimmed to UI config only after Production Migration Phase 7. This standardization plan must be compatible with that future slim.
- Frontend components must NEVER compute net salary, insurance, PIT, or any derived payroll value. They receive pre-computed values from the server and display them.
- Reserved keys (system vars + manual input keys) must be blocked from being used as `SalaryColumn.key` — otherwise a user-defined formula column could shadow a system variable.

---

## Requirements

1. **Canonical variable list** documented and enforced as a constant.
2. **Reserved key guard**: `saveSalaryColumn` blocks creating a column whose `key` is in `RESERVED_VARS`.
3. **No frontend math**: audit all `.tsx` files for any `* baseSalary`, `/ 26`, `bhxh`, `bhyt`, `pitTax` calculations — move to service layer if found.
4. **Variable aliases**: support `cong_so` as alias for `net_cong_so` in `calculatePayroll()` (backward compatibility with existing formulas).
5. All payroll values displayed in frontend come from `Payroll` DB row, not recomputed client-side.
6. `buildVarsForEmployee()` extracted as a reusable service function that constructs the full `vars` map from DB data.

---

## Architecture

### Canonical variable contract

```typescript
// src/constants/salary.ts — canonical var definitions

export const SYSTEM_VARS: Array<{ key: string; label: string; description: string }> = [
  { key: 'luong_co_ban',   label: 'Lương cơ bản',    description: 'Employee.baseSalary' },
  { key: 'phu_cap_tn',     label: 'Phụ cấp trách nhiệm', description: 'Employee.responsibilitySalary' },
  { key: 'cong_so_nhan',   label: 'Công số nhận',    description: 'Sum of WorkUnit.units in month' },
  { key: 'cong_so_tru',    label: 'Công số trừ',     description: 'Sum of abs(DeductionEvent.delta) approved' },
  { key: 'net_cong_so',    label: 'Công thực tế',    description: 'cong_so_nhan - cong_so_tru' },
  { key: 'cong_so',        label: 'Công thực tế (alias)', description: 'Alias for net_cong_so' },
  { key: 'gio_tang_ca',    label: 'Giờ tăng ca',     description: 'Sum of OvertimeEntry.hours in month' },
  { key: 'kpi_score',      label: 'KPI Score',        description: 'Derived from KpiViolation count' },
  { key: 'phu_cap',        label: 'Phụ cấp',          description: 'SalaryValue[phu_cap] — manual input' },
  { key: 'thuong',         label: 'Thưởng',            description: 'SalaryValue[thuong] — manual input' },
  { key: 'phat',           label: 'Phạt',              description: 'SalaryValue[phat] — manual input' },
  { key: 'kpi_chuyen_can', label: 'KPI Chuyên cần',   description: 'SalaryValue[kpi_chuyen_can]' },
  { key: 'kpi_trach_nhiem',label: 'KPI Trách nhiệm',  description: 'SalaryValue[kpi_trach_nhiem]' },
]

export const SYSTEM_VAR_KEYS: string[] = SYSTEM_VARS.map(v => v.key)

// Keys that cannot be used as SalaryColumn.key
export const RESERVED_VARS: Set<string> = new Set([
  ...SYSTEM_VAR_KEYS,
  'tong_thuc_nhan',  // computed last — not a formula column
  'gross_salary',    // reserved for system use
])
```

### buildVarsForEmployee — canonical service function

```typescript
// payroll.service.ts
export async function buildVarsForEmployee(
  companyId: string,
  employeeId: string,
  month: Date
): Promise<Record<string, number>> {
  const [employee, workUnits, deductions, overtimeEntries, kpiViolations, salaryValues] =
    await Promise.all([
      db.employee.findUnique({ where: { id: employeeId } }),
      db.workUnit.findMany({
        where: { employeeId, date: { gte: startOfMonth(month), lte: endOfMonth(month) } },
      }),
      db.deductionEvent.findMany({
        where: { employeeId, status: 'APPROVED', date: { gte: startOfMonth(month), lte: endOfMonth(month) } },
      }),
      db.overtimeEntry.findMany({
        where: { employeeId, date: { gte: startOfMonth(month), lte: endOfMonth(month) } },
      }),
      db.kpiViolation.findMany({
        where: { employeeId, date: { gte: startOfMonth(month), lte: endOfMonth(month) } },
      }),
      db.salaryValue.findMany({
        where: { employeeId, month: startOfMonth(month) },
      }),
    ])

  const luong_co_ban   = Number(employee!.baseSalary)
  const phu_cap_tn     = Number(employee!.responsibilitySalary)
  const cong_so_nhan   = workUnits.reduce((s, w) => s + Number(w.units), 0)
  const cong_so_tru    = deductions.reduce((s, d) => s + Math.abs(Number(d.delta)), 0)
  const net_cong_so    = cong_so_nhan - cong_so_tru
  const gio_tang_ca    = overtimeEntries.reduce((s, e) => s + Number(e.hours), 0)
  const kpi_score      = Math.max(0, 100 - kpiViolations.length * 10) // simple model

  const manualVars = Object.fromEntries(
    salaryValues.map(sv => [sv.columnKey, Number(sv.value)])
  )

  return {
    luong_co_ban, phu_cap_tn,
    cong_so_nhan, cong_so_tru,
    net_cong_so,
    cong_so: net_cong_so,  // alias
    gio_tang_ca,
    kpi_score,
    ...manualVars,  // phu_cap, thuong, phat, etc.
  }
}
```

### Reserved key guard in saveSalaryColumn

```typescript
// caidat/actions.ts — add to saveSalaryColumn
import { RESERVED_VARS } from '@/constants/salary'

if (RESERVED_VARS.has(parsed.data.key)) {
  return { ok: false, error: `Tên cột '${parsed.data.key}' là biến hệ thống, không thể dùng` }
}
```

### Frontend audit checklist (search patterns)

```bash
# Find frontend payroll calculations to eliminate
grep -r "baseSalary\s*\*" src/app --include="*.tsx"
grep -r "bhxh\|bhyt\|bhtn\|pitTax" src/app --include="*.tsx"
grep -r "/ 26" src/app --include="*.tsx"
grep -r "netSalary\s*=" src/app --include="*.tsx"
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/constants/salary.ts` | Create | SYSTEM_VARS, SYSTEM_VAR_KEYS, RESERVED_VARS |
| `src/lib/services/payroll.service.ts` | Modify | Extract buildVarsForEmployee(); add cong_so alias |
| `src/app/caidat/actions.ts` | Modify | Add RESERVED_VARS guard |
| All `src/app/**/*.tsx` | Audit | Remove any client-side payroll calculations |

---

## Implementation Steps

1. Create `src/constants/salary.ts` with `SYSTEM_VARS`, `SYSTEM_VAR_KEYS`, `RESERVED_VARS`.
2. Extract `buildVarsForEmployee()` from `calculatePayroll()` into a named export in `payroll.service.ts`.
3. Update `calculatePayroll()` to call `buildVarsForEmployee()` — no duplicate logic.
4. Add `cong_so` alias in `buildVarsForEmployee()` (same value as `net_cong_so`).
5. Import `RESERVED_VARS` in `saveSalaryColumn` Server Action — reject if key is reserved.
6. Run audit grep commands above — for each match, verify the calculation is on the server side (in service.ts) and the frontend is just displaying a pre-computed value.
7. Update `FormulaInput.tsx` (Phase 2): replace hardcoded `SYSTEM_VARS` array with import from `src/constants/salary.ts`.
8. Update preview API endpoint (Phase 2): use `buildVarsForEmployee()` for real data.

---

## Todo List

- [ ] Create src/constants/salary.ts
- [ ] Extract buildVarsForEmployee() to payroll.service.ts
- [ ] Add cong_so alias in buildVarsForEmployee
- [ ] Add RESERVED_VARS guard to saveSalaryColumn
- [ ] Run audit grep — remove any client-side payroll math
- [ ] Update FormulaInput to import vars from salary.ts
- [ ] Update preview API to use buildVarsForEmployee

---

## Success Criteria

- `SYSTEM_VAR_KEYS` contains all 13 system vars including aliases.
- Attempting to save a SalaryColumn with key `luong_co_ban` returns error.
- No `*.tsx` file contains insurance or PIT calculation logic.
- `buildVarsForEmployee()` returns consistent vars across calculatePayroll, preview API, and formula validation.
- Formula `cong_so * luong_co_ban / 26` evaluates correctly (cong_so alias works).

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing formula in DB uses `cong_so` differently | Low | Medium | Audit existing SalaryColumn.formula strings before deploy |
| Frontend calculation found in page component | Medium | Medium | Grep audit required; move to service layer if found |

---

## Security Considerations

- `RESERVED_VARS` prevents formula injection via column key naming tricks.
- `buildVarsForEmployee` always scopes by `employeeId` + `companyId` — no cross-tenant data.

---

## Next Steps

Phase 7 implements the full workflow state machine (adding LOCKED state) and extends AuditLog with before/after snapshots.
