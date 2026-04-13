# Phase 03b — Recompute Strategy

**Parent:** `plan.md`
**Dependencies:** Phase 01b (formula safety), Phase 02 (salary config — SalaryColumn save action), Phase 03 (data sync — attendance → recalc)
**Inserts after:** Phase 03
**Research refs:** `research/researcher-02-payroll-workflow.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Define the complete recompute invalidation strategy covering all triggers that should cause DRAFT payroll rows to be recalculated: attendance changes (Phase 03), **salary config changes** (new here), and manual triggers. Add a `needsRecalc` flag to Payroll so stale rows are visually distinct and automatically queued for recalculation.
- **Priority:** Critical
- **Complexity:** S
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Phase 03 covers attendance → recalc but **misses the config path**: when an admin changes a formula in `SalaryColumn`, all DRAFT Payrolls for the current month (and future months) are silently stale — they were computed with the old formula.
- This is a production-critical gap: HR changes overtime formula → clicks "Cập nhật lương" → payrolls correct. But if HR doesn't know to click the button after a formula change, they submit stale payrolls.
- Solution: on `saveSalaryColumn()`, automatically mark all DRAFT Payrolls for companyId as `needsRecalc = true` + trigger background recalc (or at minimum trigger revalidateTag to show stale state).
- Three distinct invalidation triggers with different scopes:

  | Trigger | Scope | Action |
  |---------|-------|--------|
  | WorkUnit / DeductionEvent change | One employee, one month | Recalc that employee |
  | SalaryColumn formula change | All DRAFT payrolls, current month | Mark needsRecalc + batch recalc |
  | InsuranceRate / PITBracket change | All DRAFT payrolls, affected months | Mark needsRecalc |

- `needsRecalc Boolean @default(false)` on `Payroll` — reset to `false` after each successful recalc.
- When `needsRecalc = true`, PayrollTable row shows a "⟳ Cần cập nhật" badge — distinct from the anomaly warning.
- LOCKED/PAID/APPROVED payrolls are never marked `needsRecalc` — they are immutable.

---

## Requirements

1. Add `needsRecalc Boolean @default(false)` to `Payroll` model via migration.
2. `saveSalaryColumn()` Server Action: after saving, find all DRAFT Payrolls for `companyId` in current month → set `needsRecalc = true` + `revalidateTag('payroll-{companyId}-{month}')`.
3. `saveSalaryColumn()`: also trigger `recalculateMonth()` (same as "Cập nhật lương" button) — recalc DRAFT payrolls immediately after config change so admin sees updated values.
4. `updateInsuranceRate()` / `updatePITBracket()` Server Actions: same pattern — mark affected DRAFT Payrolls `needsRecalc = true`, revalidate, then recalc.
5. `calculatePayroll()`: on successful completion, set `needsRecalc = false` in the upsert data.
6. PayrollTable: rows with `needsRecalc = true` show badge "⟳ Cần cập nhật" in amber.
7. "Cập nhật lương" button (Phase 03): also resets `needsRecalc = false` on completed rows.
8. LOCKED/APPROVED/PAID payrolls: never set `needsRecalc` — guard in the bulk-mark function.

---

## Architecture

### Schema change

```prisma
model Payroll {
  // ... existing fields ...
  needsRecalc Boolean @default(false)  // ← NEW: true = inputs changed since last calc
}
```

### markDraftPayrollsStale — reusable helper

```typescript
// payroll.service.ts

/**
 * Mark all DRAFT Payrolls for a company as needing recalculation.
 * Called when salary config or rate tables change.
 * LOCKED/APPROVED/PAID rows are never touched.
 */
export async function markDraftPayrollsStale(
  companyId: string,
  month?: Date,  // if provided, only mark that month; otherwise all months
): Promise<number> {
  const monthFilter = month ? { month: startOfMonth(month) } : {}

  const result = await db.payroll.updateMany({
    where: {
      companyId,
      status: 'DRAFT',  // only DRAFT — LOCKED/APPROVED/PAID are immutable
      ...monthFilter,
    },
    data: { needsRecalc: true },
  })

  return result.count
}
```

### saveSalaryColumn — add invalidation

```typescript
// caidat/actions.ts — after existing upsert + version snapshot

// 1. Mark DRAFT payrolls stale
const staleCount = await payrollService.markDraftPayrollsStale(companyId)

// 2. Recalculate immediately so admin sees updated values
const currentMonth = format(new Date(), 'yyyy-MM')
await payrollService.recalculateMonth(companyId, new Date(`${currentMonth}-01`))

// 3. Invalidate both salary-columns cache and payroll cache
revalidateTag(`salary-columns-${companyId}`)
revalidateTag(`payroll-${companyId}-${currentMonth}`)

return { ok: true, recalculated: staleCount }
```

### updateInsuranceRate / updatePITBracket — same pattern

```typescript
// caidat/actions.ts
export async function updateInsuranceRate(formData: FormData) {
  // ... existing save logic ...

  // All months where the new rate applies
  await payrollService.markDraftPayrollsStale(companyId)
  await payrollService.recalculateMonth(companyId, new Date(`${currentMonth}-01`))

  revalidateTag(`insurance-rates-${companyId}`)
  revalidateTag(`payroll-${companyId}-${currentMonth}`)
  return { ok: true }
}
```

### calculatePayroll — reset needsRecalc on completion

```typescript
// payroll.service.ts — inside calculatePayroll upsert data:
const payrollData = {
  // ... existing fields ...
  needsRecalc: false,  // ← reset on every successful recalc
  anomalies: allAnomalies as unknown as Prisma.JsonArray,
}
```

### PayrollTable — needsRecalc badge

```tsx
// PayrollTable.tsx
{row.needsRecalc && (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold
    bg-amber-50 text-amber-700 border border-amber-200 rounded">
    ⟳ Cần cập nhật
  </span>
)}
```

### Full trigger matrix

```
Trigger                          → markDraftPayrollsStale?  → recalculateMonth?  → revalidateTag
─────────────────────────────────────────────────────────────────────────────────────────────────
WorkUnit upsert/delete           → NO (Phase 03: recalcs specific employee)  → specific employee
DeductionEvent approved          → NO (Phase 03: recalcs specific employee)  → specific employee
SalaryColumn formula saved       → YES (all DRAFT, current month)            → YES (current month)
InsuranceRate updated            → YES (all DRAFT, current month)            → YES (current month)
PITBracket updated               → YES (all DRAFT, current month)            → YES (current month)
"Cập nhật lương" button          → NO (already recalcing) → resets needsRecalc on completion
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | Modify | Add `needsRecalc Boolean @default(false)` to Payroll |
| `prisma/migrations/` | Create | Migration for new field |
| `src/lib/services/payroll.service.ts` | Modify | Add `markDraftPayrollsStale()`, set `needsRecalc: false` in calculatePayroll upsert |
| `src/app/caidat/actions.ts` | Modify | `saveSalaryColumn` + `updateInsuranceRate` + `updatePITBracket`: mark stale + recalc |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Render `needsRecalc` badge |

---

## Implementation Steps

1. Add `needsRecalc Boolean @default(false)` to `Payroll` in schema.prisma.
2. Run `npx prisma migrate dev --name add_payroll_needs_recalc`.
3. Write `markDraftPayrollsStale(companyId, month?)` in `payroll.service.ts`.
4. Add `needsRecalc: false` to `calculatePayroll()` upsert data block.
5. In `saveSalaryColumn()`: after save, call `markDraftPayrollsStale(companyId)` + `recalculateMonth(companyId, currentMonth)` + two `revalidateTag()` calls.
6. In `updateInsuranceRate()`: same pattern.
7. In `updatePITBracket()`: same pattern.
8. In `PayrollTable.tsx`: add `needsRecalc` badge rendering (amber, "⟳ Cần cập nhật").
9. Test: change formula → all DRAFT payrolls recalculate automatically → `needsRecalc = false` after.
10. Test: LOCKED payroll not affected by formula change.

---

## Todo List

- [ ] Add needsRecalc field to Payroll schema
- [ ] Run migration
- [ ] Write markDraftPayrollsStale() service function
- [ ] Set needsRecalc: false in calculatePayroll upsert
- [ ] Update saveSalaryColumn: mark stale + recalc + revalidate
- [ ] Update updateInsuranceRate: mark stale + recalc + revalidate
- [ ] Update updatePITBracket: mark stale + recalc + revalidate
- [ ] Add needsRecalc badge to PayrollTable
- [ ] Test: formula change → DRAFT payrolls auto-recalc → needsRecalc = false
- [ ] Test: LOCKED payroll not touched by markDraftPayrollsStale
- [ ] Test: insurance rate change → payroll netSalary updates

---

## Success Criteria

- Change a SalaryColumn formula → all DRAFT Payrolls for current month recalculate within the same Server Action call (no manual click needed).
- LOCKED payroll with status `LOCKED`: `markDraftPayrollsStale()` never touches it.
- After successful `calculatePayroll()`: `Payroll.needsRecalc = false`.
- If recalc fails (formula error): `Payroll.needsRecalc` remains `true` (it was set before recalc and `calculatePayroll` saves with `needsRecalc: false` only on success).
- `PayrollTable` shows amber "⟳ Cần cập nhật" badge for stale rows.
- "Cập nhật lương" button clears `needsRecalc` on all rows it processes.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Batch recalc on formula save too slow (>100 employees) | Low | Medium | Run `Promise.all` in `recalculateMonth()`; at >100 employees, consider background queue (defer to Phase 09+ optimization) |
| markDraftPayrollsStale marks wrong months | Low | Medium | Only mark `status: 'DRAFT'` rows; LOCKED guard prevents data corruption |
| recalculate after config save fails partway | Low | Medium | Each employee's `calculatePayroll()` is independent; partial failure = some rows still stale (`needsRecalc = true`) — visible in UI |

---

## Security Considerations

- `markDraftPayrollsStale()` scoped by `companyId` from session — no cross-tenant writes.
- `updateInsuranceRate` / `updatePITBracket` require `caidat.edit` permission.
- Auto-recalc triggered by config actions inherits same permission check as the action itself.

---

## Next Steps

Phases 04–06 build on stable data sync. Phase 07 introduces LOCKED status. Phase 07b (Payroll Snapshot) uses `needsRecalc = false` as a precondition before locking.
