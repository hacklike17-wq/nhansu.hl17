# Phase 07 — Workflow & Audit

**Parent:** `plan.md`
**Dependencies:** Phase 06 (standardized system), Production Migration Phase 3 (AuditLog in DB)
**Research refs:** `research/researcher-02-payroll-workflow.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Extend the payroll status machine with a `LOCKED` state (immutable), add before/after snapshots to AuditLog, and enforce the full workflow: DRAFT → PENDING → APPROVED → LOCKED → PAID.
- **Priority:** High
- **Complexity:** M
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Current `PayrollStatus` enum: `DRAFT | PENDING | APPROVED | PAID`. Missing `LOCKED`.
- `LOCKED` means: payroll is final, no edits, no recalculation, no manual input changes. It sits between APPROVED and PAID.
- Rationale: APPROVED = manager sign-off. LOCKED = accounting locked it for disbursement. PAID = money transferred.
- Current `AuditLog.changes: Json?` is a single field. The research recommends splitting into `oldData: Json?` + `newData: Json?` for clarity. Add via Prisma migration.
- Every state transition must write an AuditLog row within the same `db.$transaction()`.
- The state machine must be enforced in Server Actions, not just UI — a UI state check is insufficient (can be bypassed).
- Backward transitions are forbidden: LOCKED → APPROVED is blocked, APPROVED → DRAFT is blocked, etc.

---

## Requirements

1. Add `LOCKED` to `PayrollStatus` enum in Prisma schema + migration.
2. Add `oldData Json?` + `newData Json?` to `AuditLog` model + migration.
3. State machine transitions:
   - DRAFT → PENDING: requires `luong.edit`
   - PENDING → APPROVED: requires `luong.approve`
   - APPROVED → LOCKED: requires `luong.approve`
   - LOCKED → PAID: requires `luong.approve`
4. Each transition is a separate Server Action: `toPending()`, `approve()`, `lock()`, `markPaid()`.
5. All transitions run inside `db.$transaction()` with AuditLog write.
6. AuditLog `oldData` = full `Payroll` row snapshot before change. `newData` = `{ status, changedAt }`.
7. LOCKED payrolls: `saveManualInput()` returns error "Bảng lương đã khóa". `recalculateMonth()` skips LOCKED+.
8. Status badges in UI: LOCKED = orange/amber style.
9. Concurrency guard on all transitions: use `updateMany` + check `count === 0`.

---

## Architecture

### Schema changes (migration required)

```prisma
// schema.prisma — changes

enum PayrollStatus {
  DRAFT
  PENDING
  APPROVED
  LOCKED   // ← NEW
  PAID
}

model AuditLog {
  // existing fields kept...
  oldData   Json?     // ← NEW: full snapshot before change
  newData   Json?     // ← NEW: snapshot after change (or just { status, action })
  changedAt DateTime  @default(now())  // ← rename from createdAt for clarity (optional)
}
```

### State machine diagram

```
DRAFT ──[luong.edit]──→ PENDING ──[luong.approve]──→ APPROVED ──[luong.approve]──→ LOCKED ──[luong.approve]──→ PAID
  ↑                                                                                     ↑
  └── recalculate allowed                                                          no edits allowed
```

### Server Action pattern — approve() with concurrency guard

```typescript
// luong/actions.ts
'use server'
export async function approvePayroll(payrollId: string) {
  const session = await auth()
  if (!session || !hasPermission(session.user.permissions, 'luong.approve'))
    return { ok: false, error: 'Không có quyền' }

  const companyId = session.user.companyId!

  return withAction(async () => {
    await db.$transaction(async (tx) => {
      // 1. Capture current state (for oldData)
      const before = await tx.payroll.findUnique({ where: { id: payrollId } })
      if (!before) throw new Error('Không tìm thấy bảng lương')

      // 2. Transition with concurrency guard
      const result = await tx.payroll.updateMany({
        where: { id: payrollId, companyId, status: 'PENDING' }, // ← status precondition
        data: { status: 'APPROVED', approvedBy: session.user.id, approvedAt: new Date() },
      })
      if (result.count === 0)
        throw new Error('Bảng lương đã được xử lý bởi người khác')

      // 3. Write AuditLog with before/after
      await tx.auditLog.create({
        data: {
          companyId,
          entityType: 'Payroll',
          entityId: payrollId,
          action: 'APPROVED',
          changedBy: session.user.id,
          oldData: before as unknown as Prisma.JsonObject,
          newData: { status: 'APPROVED', approvedBy: session.user.id, approvedAt: new Date().toISOString() },
        },
      })
    })

    revalidateTag(`payroll-${companyId}-${/* month */}`)
  })
}
```

### All four transition Server Actions

```typescript
// Pattern is identical — only where.status changes:
toPending:  where: { status: 'DRAFT' },    data: { status: 'PENDING' }
approve:    where: { status: 'PENDING' },  data: { status: 'APPROVED', approvedBy, approvedAt }
lock:       where: { status: 'APPROVED' }, data: { status: 'LOCKED' }
markPaid:   where: { status: 'LOCKED' },   data: { status: 'PAID', paidAt: new Date() }
```

### Guards in other actions

```typescript
// saveManualInput — add guard
if (['LOCKED', 'PAID', 'APPROVED', 'PENDING'].includes(payroll.status))
  return { ok: false, error: 'Chỉ sửa được bản lương DRAFT' }

// recalculateMonth — skip non-DRAFT
const draftPayrolls = await db.payroll.findMany({
  where: { companyId, month: startOfMonth(month), status: 'DRAFT' }, // LOCKED excluded
})
```

### Status badge map update

```typescript
const PAYROLL_STATUS_MAP = {
  DRAFT:    { label: 'Nháp',       cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  PENDING:  { label: 'Chờ duyệt',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Đã duyệt',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  LOCKED:   { label: 'Đã khóa',    cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  PAID:     { label: 'Đã thanh toán', cls: 'bg-green-50 text-green-700 border-green-200' },
}
```

### PayrollApprovalBar component (updated)

```tsx
// components/PayrollApprovalBar.tsx
function PayrollApprovalBar({ payroll, session }) {
  const canEdit    = hasPermission(session.permissions, 'luong.edit')
  const canApprove = hasPermission(session.permissions, 'luong.approve')

  return (
    <div className="flex gap-2">
      {payroll.status === 'DRAFT'    && canEdit    && <Button onClick={toPending}>Gửi duyệt</Button>}
      {payroll.status === 'PENDING'  && canApprove && <Button onClick={approve}>Duyệt</Button>}
      {payroll.status === 'APPROVED' && canApprove && <Button onClick={lock}>Khóa bảng lương</Button>}
      {payroll.status === 'LOCKED'   && canApprove && <Button onClick={markPaid}>Đánh dấu đã trả</Button>}
    </div>
  )
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | Modify | Add LOCKED enum, oldData/newData to AuditLog |
| `prisma/migrations/` | Create | Migration for enum + AuditLog fields |
| `src/app/luong/actions.ts` | Modify | Add toPending, approve, lock, markPaid + guards |
| `src/app/luong/components/PayrollApprovalBar.tsx` | Modify | Add LOCKED state button |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Update status badge map |
| `src/app/luong/actions.ts` | Modify | saveManualInput: block LOCKED+ |
| `src/lib/services/payroll.service.ts` | Modify | recalculateMonth: only DRAFT |
| `src/types/index.ts` | Modify | Add LOCKED to PayrollStatus type if needed |

---

## Implementation Steps

1. Add `LOCKED` to `PayrollStatus` enum in `schema.prisma`.
2. Add `oldData Json?` + `newData Json?` to `AuditLog` in `schema.prisma`.
3. Run `npx prisma migrate dev --name add_locked_status_and_audit_fields`.
4. Write `toPending(payrollIds: string[])` Server Action (bulk — select all DRAFT, send to pending).
5. Write `approvePayroll(payrollId: string)` with concurrency guard + AuditLog.
6. Write `lockPayroll(payrollId: string)` — APPROVED → LOCKED.
7. Write `markPayrollPaid(payrollId: string)` — LOCKED → PAID.
8. Update `saveManualInput()`: block if status is PENDING, APPROVED, LOCKED, or PAID.
9. Update `recalculateMonth()`: filter `status: 'DRAFT'` only.
10. Update `PayrollApprovalBar.tsx`: add LOCKED button, update status map.
11. Test double-approve: two concurrent calls to `approvePayroll(sameId)` → second returns error.

---

## Todo List

- [ ] Add LOCKED to PayrollStatus enum
- [ ] Add oldData + newData to AuditLog model
- [ ] Run Prisma migration
- [ ] Write toPending Server Action
- [ ] Write approvePayroll Server Action (concurrency guard + AuditLog)
- [ ] Write lockPayroll Server Action
- [ ] Write markPayrollPaid Server Action
- [ ] Update saveManualInput: block LOCKED+
- [ ] Update recalculateMonth: DRAFT only
- [ ] Update PayrollApprovalBar UI
- [ ] Update status badge map (LOCKED = orange)
- [ ] Test: double-approve → second returns error
- [ ] Test: edit manual input on LOCKED payroll → error

---

## Success Criteria

- `LOCKED` appears in PayrollStatus enum and DB correctly.
- Transitioning LOCKED → APPROVED returns error (backward transition blocked by `where.status` precondition).
- AuditLog row created for every transition with `oldData` = full payroll snapshot.
- Two concurrent approve calls: one succeeds, other gets "đã được xử lý bởi người khác".
- LOCKED payroll: "Cập nhật lương" button skips it; manual input returns error.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing payroll rows with APPROVED status break on LOCKED addition | Low | Low | Enum addition is backward-compatible; existing rows unaffected |
| Migration fails on production (column add) | Low | Medium | Test migration on staging DB copy first |
| AuditLog oldData serialization fails for Decimal fields | Medium | Medium | JSON.stringify Decimal → use `serializeDecimal()` helper before storing |

---

## Security Considerations

- Backward transitions blocked by status precondition in `updateMany` — cannot be bypassed by calling Server Action directly.
- `companyId` from session always used in `where` clause — no cross-tenant escalation.
- AuditLog captures `changedBy: session.user.id` — full accountability trail.

---

## Next Steps

Phase 8 adds SalaryColumnVersion history and unit tests for the full formula + payroll pipeline.
