# Phase 03 — Data Sync

**Parent:** `plan.md`
**Dependencies:** Phase 01 (formula engine), Production Migration Phase 4 (HR modules with Server Actions)
**Research refs:** `research/researcher-02-payroll-workflow.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Ensure payroll data is always consistent with attendance (WorkUnit/DeductionEvent) and KPI data. Implement auto-recalculation trigger when attendance changes, a manual "Cập nhật lương" button, and revalidation patterns that prevent stale data across modules.
- **Priority:** Critical
- **Complexity:** M
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Currently, if HR edits a WorkUnit after payroll is generated, the Payroll row goes stale silently — no indication to the user.
- Auto-recalc should NOT recalculate APPROVED/LOCKED/PAID payrolls — only DRAFT ones. Approved payrolls are immutable.
- Recalculation is idempotent: calling `calculatePayroll()` again produces the same result if inputs haven't changed.
- `revalidateTag` pattern is already established for this codebase — extend it to payroll invalidation after attendance writes.
- "Cập nhật lương" button recalculates all DRAFT payrolls for the selected month — not individual rows.
- KPI data (`KpiViolation`, `OvertimeEntry`) must also trigger recalc when changed.
- Do NOT recalculate in a background job / cron — recalculate synchronously in the Server Action (acceptable at SME scale).

---

## Requirements

1. When `WorkUnit` is created/updated/deleted → `revalidateTag('payroll-{companyId}-{month}')` AND recalculate the affected employee's DRAFT Payroll for that month.
2. When `DeductionEvent` status changes to APPROVED → recalculate affected employee's DRAFT Payroll.
3. When `KpiViolation` or `OvertimeEntry` is added/updated → recalculate affected employee's DRAFT Payroll.
4. Recalculation skips Payrolls with status `PENDING | APPROVED | LOCKED | PAID`.
5. Manual "Cập nhật lương" button on `/luong` page: recalculates ALL employees' DRAFT Payrolls for the current month.
6. "Cập nhật lương" action returns `{ updated: number }` count for UI feedback.
7. After any recalculation, `revalidateTag('payroll-{companyId}-{month}')` is called.
8. Stale indicator: if `Payroll.updatedAt < WorkUnit.updatedAt` for any WorkUnit in month → flag payroll row as stale in UI (optional but recommended).

---

## Architecture

### Data flow on attendance change

```
User edits WorkUnit
    ↓
Server Action: updateWorkUnit()
    ↓
workUnit saved to DB
    ↓
if employee has DRAFT Payroll for that month:
    calculatePayroll(companyId, employeeId, month)  ← recalculate
    ↓
revalidateTag('payroll-{companyId}-{YYYY-MM}')
revalidateTag('attendance-{companyId}-{YYYY-MM}')
```

### Manual recalc flow

```
User clicks "Cập nhật lương" on /luong page
    ↓
Server Action: recalculateMonthPayroll(companyId, month)
    ↓
db.payroll.findMany({ where: { companyId, month, status: 'DRAFT' } })
    ↓
for each draftPayroll: calculatePayroll(companyId, employeeId, month)
    ↓
revalidateTag('payroll-{companyId}-{YYYY-MM}')
return { updated: count }
```

### Files

```
src/app/chamcong/actions.ts       — modify: add recalc call after WorkUnit write
src/app/luong/actions.ts          — add: recalculateMonthPayroll()
src/app/luong/components/
  PayrollTable.tsx                — add: "Cập nhật lương" button + loading state
src/lib/services/payroll.service.ts — add: recalculateMonthPayroll()
```

### Server Action: recalculateMonthPayroll

```typescript
// luong/actions.ts
'use server'
export async function recalculateMonthPayroll(month: string) {
  const session = await auth()
  if (!session || !hasPermission(session.user.permissions, 'luong.edit')) {
    return { ok: false, error: 'Không có quyền' }
  }

  const companyId = session.user.companyId!
  const monthDate = new Date(`${month}-01`)

  const count = await payrollService.recalculateMonth(companyId, monthDate)
  revalidateTag(`payroll-${companyId}-${month}`)

  return { ok: true, updated: count }
}
```

```typescript
// payroll.service.ts
async recalculateMonth(companyId: string, month: Date): Promise<number> {
  const draftPayrolls = await db.payroll.findMany({
    where: { companyId, month: startOfMonth(month), status: 'DRAFT' },
    select: { employeeId: true },
  })

  await Promise.all(
    draftPayrolls.map(p => calculatePayroll(companyId, p.employeeId, month))
  )

  return draftPayrolls.length
}
```

### Attendance action update

```typescript
// chamcong/actions.ts — add after existing WorkUnit upsert
export async function upsertWorkUnit(formData: FormData) {
  // ... existing validation + db write ...

  // Auto-recalc DRAFT payroll for this employee+month
  const monthDate = new Date(`${month}-01`)
  const draftPayroll = await db.payroll.findUnique({
    where: { employeeId_month: { employeeId, month: startOfMonth(monthDate) } },
    select: { status: true },
  })

  if (!draftPayroll || draftPayroll.status === 'DRAFT') {
    await payrollService.calculatePayroll(companyId, employeeId, monthDate)
  }

  revalidateTag(`attendance-${companyId}-${month}`)
  revalidateTag(`payroll-${companyId}-${month}`)
  return { ok: true }
}
```

### Stale indicator (optional)

```typescript
// In payroll.service.ts — listPayroll()
// For each payroll row, check if any WorkUnit for that employee+month
// was updated after the payroll's updatedAt
const payrolls = await db.payroll.findMany({ ... })

const staleCheck = await Promise.all(payrolls.map(async p => {
  const latestUnit = await db.workUnit.findFirst({
    where: { employeeId: p.employeeId, date: { gte: startOfMonth(p.month), lte: endOfMonth(p.month) } },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })
  return { ...p, isStale: latestUnit ? latestUnit.updatedAt > p.updatedAt : false }
}))
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/app/chamcong/actions.ts` | Modify | Call recalc after WorkUnit write |
| `src/app/nghiphep/actions.ts` | Modify | Call recalc after DeductionEvent approval |
| `src/app/luong/actions.ts` | Modify | Add `recalculateMonthPayroll()` |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Add "Cập nhật lương" button |
| `src/lib/services/payroll.service.ts` | Modify | Add `recalculateMonth()` |

---

## Implementation Steps

1. In `payroll.service.ts`: add `recalculateMonth(companyId, month)` function.
2. In `luong/actions.ts`: add `recalculateMonthPayroll(month)` Server Action with permission check.
3. In `PayrollTable.tsx`: add "Cập nhật lương" button — calls action via `useTransition`, show "Đang cập nhật..." and result count toast.
4. In `chamcong/actions.ts:upsertWorkUnit()`: after DB write, check employee has DRAFT payroll → call `calculatePayroll()`.
5. In `chamcong/actions.ts:deleteWorkUnit()`: same check + recalc.
6. In `nghiphep/actions.ts:approveLeave()`: after DeductionEvent batch creation, recalc affected employee's DRAFT payroll.
7. In `chamcong/actions.ts` (KpiViolation/OvertimeEntry): same pattern — write to DB, then recalc.
8. Add stale indicator to Payroll row (optional — add `isStale` boolean field to service return type).
9. Test: edit WorkUnit → verify Payroll.netSalary updates immediately.

---

## Todo List

- [ ] Add `recalculateMonth()` to payroll.service.ts
- [ ] Add `recalculateMonthPayroll()` Server Action in luong/actions.ts
- [ ] Add "Cập nhật lương" button to PayrollTable.tsx with useTransition + toast
- [ ] Update upsertWorkUnit action: auto-recalc DRAFT payroll after write
- [ ] Update deleteWorkUnit action: auto-recalc after delete
- [ ] Update approveLeave action: recalc after DeductionEvent batch created
- [ ] Update KpiViolation/OvertimeEntry actions: recalc after write
- [ ] Add `revalidateTag('payroll-{companyId}-{month}')` to all attendance mutations
- [ ] (Optional) Add `isStale` indicator to payroll service return type

---

## Success Criteria

- Edit WorkUnit (add 1 day) → Payroll.congSoNhan increases by 1 after page reload.
- Approve 3-day leave → Payroll.congSoTru increases by 3 after page reload.
- PENDING/APPROVED payrolls NOT recalculated when attendance changes.
- "Cập nhật lương" button shows "Đã cập nhật 5 bản lương" toast on success.
- "Cập nhật lương" on a month with no DRAFT payrolls returns `updated: 0` without error.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Recalc too slow for large employee count | Low | Medium | `Promise.all` parallelizes; if >100 employees consider batching |
| Race condition: two concurrent WorkUnit edits recalc same payroll | Low | Low | `Payroll.upsert` is idempotent — last write wins, acceptable |
| Recalc triggered on APPROVED payroll by mistake | Low | High | Guard: check status === 'DRAFT' before calling calculatePayroll() |

---

## Security Considerations

- `luong.edit` required for manual "Cập nhật lương".
- Auto-recalc triggered by attendance actions — those already check `chamcong.edit` permission.
- `companyId` always from session in recalculate calls.

---

## Next Steps

Phase 4 handles CRUD for adding/removing employees from attendance and payroll tables directly.
