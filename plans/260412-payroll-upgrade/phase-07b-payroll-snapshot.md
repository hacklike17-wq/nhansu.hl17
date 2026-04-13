# Phase 07b — Payroll Snapshot

**Parent:** `plan.md`
**Dependencies:** Phase 07 (LOCKED status implemented), Phase 03b (needsRecalc = false before lock), Phase 06 (buildVarsForEmployee canonical)
**Inserts after:** Phase 07
**Research refs:** `research/researcher-02-payroll-workflow.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** When a Payroll row transitions to `LOCKED`, capture and store the complete calculation context as an immutable JSON snapshot on the Payroll row. This snapshot is the authoritative record of how net salary was computed and must never be overwritten. After locking, the system must never recompute the payroll — it reads from the snapshot instead.
- **Priority:** Critical
- **Complexity:** S
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Phase 07 stores `oldData` / `newData` in `AuditLog` — this is a **transition log**, not a **calculation snapshot**. It records that the status changed, not HOW the salary was computed.
- A separate `Payroll.snapshot Json?` field stores the full calculation context: every input variable, every formula result, every rate used, and the formula version IDs that were active. This is the auditor's source of truth.
- Difference between AuditLog `oldData` and `Payroll.snapshot`:
  - `AuditLog.oldData` = full Payroll row before a specific status change (who changed what when)
  - `Payroll.snapshot` = calculation context captured at the moment of locking (how was the number computed)
- After `LOCKED`, `calculatePayroll()` must **not** be called for that employee+month. The guard already exists in `recalculateMonth()` (DRAFT-only filter), but must also be enforced at the service function level.
- `snapshot` is set exactly once — during the `APPROVED → LOCKED` transition. It is never updated after that.
- If for any reason recalculation is needed post-lock (legal audit, investigation), a separate read-only `previewRecalculate()` function can run without writing to DB. This function is out of scope for this phase but the architecture must not prevent it.

---

## Requirements

1. Add `snapshot Json?` to `Payroll` model via migration.
2. `lockPayroll()` Server Action (Phase 07): before transitioning APPROVED → LOCKED, call `buildPayrollSnapshot(companyId, employeeId, month)` and include the result in the `update` data.
3. `buildPayrollSnapshot()` captures:
   ```typescript
   interface PayrollSnapshot {
     capturedAt: string           // ISO timestamp
     lockedBy: string             // userId
     // Input variables
     vars: Record<string, number> // full vars map from buildVarsForEmployee()
     // Formula results per column
     formulaResults: Array<{
       columnKey: string
       columnName: string
       formula: string
       result: number | null
       formulaVersionId?: string  // SalaryColumnVersion.id (Phase 08)
     }>
     // Rates used
     insuranceRates: {
       bhxhRate: number
       bhytRate: number
       bhtnRate: number
       validFrom: string
     }
     pitBrackets: Array<{
       minIncome: number
       maxIncome: number | null
       rate: number
     }>
     // Final computed values
     computed: {
       grossSalary: number
       bhxhEmployee: number
       bhytEmployee: number
       bhtnEmployee: number
       pitTax: number
       netSalary: number
     }
   }
   ```
4. `snapshot` is written atomically inside the same `db.$transaction()` as the LOCKED status transition.
5. After `snapshot` is written, `Payroll.needsRecalc` is set to `false` permanently (it won't be set to `true` again because LOCKED rows are excluded from `markDraftPayrollsStale()`).
6. `calculatePayroll()`: add guard at the TOP of the function — if payroll exists with `status !== 'DRAFT'`, return early without recalculating.
7. UI: LOCKED payroll rows show a "📋 Xem snapshot" link that opens a read-only modal displaying the snapshot contents.
8. `Payroll.snapshot` field is **never null** for LOCKED/PAID rows. If snapshot is null for a LOCKED row (legacy data), show a warning in the audit view.

---

## Architecture

### Schema change

```prisma
model Payroll {
  // ... existing fields ...
  snapshot Json?  // ← NEW: full calculation context, written at LOCKED transition, immutable
}
```

### buildPayrollSnapshot function

```typescript
// payroll.service.ts

export async function buildPayrollSnapshot(
  companyId: string,
  employeeId: string,
  month: Date,
  lockedBy: string,
): Promise<PayrollSnapshot> {
  // Reuse existing data-fetching logic (same as calculatePayroll)
  const vars = await buildVarsForEmployee(companyId, employeeId, month)  // Phase 06

  const columns = await getColumnsForMonth(companyId, month)  // Phase 08 versioned fetch
  const graph = buildDependencyGraph(columns)
  const sortedKeys = topologicalSort(graph)

  const formulaResults: PayrollSnapshot['formulaResults'] = []
  const varsCopy = { ...vars }

  for (const key of sortedKeys) {
    const col = columns.find(c => c.key === key)
    if (!col || col.type !== 'formula' || !col.formula) continue
    const result = evalFormula(col.formula, varsCopy)
    if (result !== null) varsCopy[key] = result
    formulaResults.push({
      columnKey: key,
      columnName: col.name,
      formula: col.formula,
      result,
    })
  }

  const [insuranceRate, pitBrackets] = await Promise.all([
    db.insuranceRate.findFirst({
      where: { companyId, type: 'BHXH', validFrom: { lte: month }, OR: [{ validTo: null }, { validTo: { gte: month } }] },
    }),
    db.pITBracket.findMany({
      where: { companyId, validFrom: { lte: month } },
      orderBy: { minIncome: 'asc' },
    }),
  ])

  return {
    capturedAt: new Date().toISOString(),
    lockedBy,
    vars,
    formulaResults,
    insuranceRates: {
      bhxhRate: Number(insuranceRate?.employeeRate ?? 0.08),
      bhytRate: 0.015,
      bhtnRate: 0.01,
      validFrom: insuranceRate?.validFrom.toISOString() ?? '',
    },
    pitBrackets: pitBrackets.map(b => ({
      minIncome: Number(b.minIncome),
      maxIncome: b.maxIncome ? Number(b.maxIncome) : null,
      rate: Number(b.rate),
    })),
    computed: {
      grossSalary: varsCopy['gross_salary'] ?? 0,
      bhxhEmployee: varsCopy['bhxh_employee'] ?? 0,
      bhytEmployee: varsCopy['bhyt_employee'] ?? 0,
      bhtnEmployee: varsCopy['bhtn_employee'] ?? 0,
      pitTax: varsCopy['pit_tax'] ?? 0,
      netSalary: varsCopy['net_salary'] ?? 0,
    },
  }
}
```

### lockPayroll — updated with snapshot

```typescript
// luong/actions.ts
export async function lockPayroll(payrollId: string) {
  const session = await auth()
  if (!session || !hasPermission(session.user.permissions, 'luong.approve'))
    return { ok: false, error: 'Không có quyền' }

  const companyId = session.user.companyId!

  return withAction(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.payroll.findUnique({ where: { id: payrollId } })
      if (!before) throw new Error('Không tìm thấy bảng lương')
      if (before.needsRecalc) throw new Error('Bảng lương cần được cập nhật trước khi khóa')

      // Build snapshot BEFORE locking (requires APPROVED status — data is final)
      const snapshot = await buildPayrollSnapshot(
        companyId,
        before.employeeId,
        before.month,
        session.user.id,
      )

      // Transition with concurrency guard
      const result = await tx.payroll.updateMany({
        where: { id: payrollId, companyId, status: 'APPROVED' },
        data: {
          status: 'LOCKED',
          needsRecalc: false,
          snapshot: snapshot as unknown as Prisma.JsonObject,
        },
      })
      if (result.count === 0) throw new Error('Bảng lương đã được xử lý bởi người khác')

      // AuditLog
      await tx.auditLog.create({
        data: {
          companyId,
          entityType: 'Payroll',
          entityId: payrollId,
          action: 'LOCKED',
          changedBy: session.user.id,
          oldData: before as unknown as Prisma.JsonObject,
          newData: { status: 'LOCKED', snapshot: '<<stored separately>>' },
        },
      })
    })

    revalidateTag(`payroll-${companyId}-${format(before.month, 'yyyy-MM')}`)
  })
}
```

### calculatePayroll — early exit guard

```typescript
// payroll.service.ts — at the very top of calculatePayroll()

const existing = await db.payroll.findUnique({
  where: { employeeId_month: { employeeId, month: startOfMonth(month) } },
  select: { status: true },
})

// NEVER recompute non-DRAFT payrolls
if (existing && existing.status !== 'DRAFT') {
  console.warn(`calculatePayroll: skipping ${employeeId}/${format(month, 'yyyy-MM')} — status is ${existing.status}`)
  return { payroll: existing as Payroll, formulaErrors: [] }
}

// ... rest of calculation
```

### lockPayroll guard: needsRecalc check

```typescript
// Before locking: if needsRecalc = true, block
if (before.needsRecalc) {
  return { ok: false, error: 'Bảng lương cần được cập nhật trước khi khóa. Nhấn "Cập nhật lương" trước.' }
}
```

### Snapshot viewer modal (UI)

```tsx
// PayrollSnapshotModal.tsx — 'use client' — read-only
function PayrollSnapshotModal({ snapshot }: { snapshot: PayrollSnapshot }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Snapshot tính lương</h3>
      <p className="text-xs text-gray-500">Khóa lúc: {fmtDate(snapshot.capturedAt)}</p>

      <section>
        <h4 className="text-sm font-medium mb-1">Biến đầu vào</h4>
        <table className="text-xs w-full">
          {Object.entries(snapshot.vars).map(([k, v]) => (
            <tr key={k}>
              <td className="text-gray-500 pr-4">{k}</td>
              <td className="text-right font-mono">{v.toLocaleString()}</td>
            </tr>
          ))}
        </table>
      </section>

      <section>
        <h4 className="text-sm font-medium mb-1">Kết quả công thức</h4>
        {snapshot.formulaResults.map(f => (
          <div key={f.columnKey} className="flex justify-between text-xs py-0.5">
            <span className="text-gray-600">{f.columnName} <code className="text-gray-400">({f.formula})</code></span>
            <span className={f.result === null ? 'text-red-500' : 'font-mono'}>
              {f.result === null ? 'LỖI' : fmtVND(f.result)}
            </span>
          </div>
        ))}
      </section>

      <section>
        <h4 className="text-sm font-medium mb-1">Kết quả cuối</h4>
        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span>Gross</span><span>{fmtVND(snapshot.computed.grossSalary)}</span></div>
          <div className="flex justify-between text-red-600"><span>BHXH NV</span><span>-{fmtVND(snapshot.computed.bhxhEmployee)}</span></div>
          <div className="flex justify-between text-red-600"><span>Thuế TNCN</span><span>-{fmtVND(snapshot.computed.pitTax)}</span></div>
          <div className="flex justify-between font-semibold border-t pt-1"><span>Thực nhận</span><span>{fmtVND(snapshot.computed.netSalary)}</span></div>
        </div>
      </section>
    </div>
  )
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | Modify | Add `snapshot Json?` to Payroll |
| `prisma/migrations/` | Create | Migration for snapshot field |
| `src/lib/services/payroll.service.ts` | Modify | Add `buildPayrollSnapshot()`, early-exit guard in `calculatePayroll()` |
| `src/app/luong/actions.ts` | Modify | `lockPayroll()`: call `buildPayrollSnapshot()` + check `needsRecalc` before locking |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Add "Xem snapshot" button for LOCKED rows |
| `src/app/luong/components/PayrollSnapshotModal.tsx` | Create | Read-only snapshot viewer |

---

## Implementation Steps

1. Add `snapshot Json?` to `Payroll` in schema.prisma.
2. Run `npx prisma migrate dev --name add_payroll_snapshot`.
3. Write `buildPayrollSnapshot(companyId, employeeId, month, lockedBy)` in `payroll.service.ts`.
4. Add early-exit guard at top of `calculatePayroll()` — return immediately if status !== 'DRAFT'.
5. Update `lockPayroll()` Server Action:
   a. Check `before.needsRecalc === false` — block if true.
   b. Call `buildPayrollSnapshot()`.
   c. Include `snapshot` in `updateMany` data within transaction.
6. Create `PayrollSnapshotModal.tsx` — read-only display of snapshot fields.
7. Update `PayrollTable.tsx`: for rows with `status === 'LOCKED' || status === 'PAID'`, show "📋 Snapshot" button.
8. Test: lock a payroll → verify `Payroll.snapshot` is populated in DB.
9. Test: change formula after lock → verify locked payroll NOT recalculated.
10. Test: lock with `needsRecalc = true` → blocked with error message.

---

## Todo List

- [ ] Add snapshot Json? to Payroll schema
- [ ] Run migration
- [ ] Write buildPayrollSnapshot() service function
- [ ] Add early-exit guard to calculatePayroll() for non-DRAFT
- [ ] Update lockPayroll: needsRecalc check + buildPayrollSnapshot + include in transaction
- [ ] Create PayrollSnapshotModal.tsx
- [ ] Add "📋 Snapshot" button to PayrollTable for LOCKED/PAID rows
- [ ] Test: lock payroll → snapshot field populated in DB
- [ ] Test: change formula → locked payroll not recalculated
- [ ] Test: lock with needsRecalc=true → blocked
- [ ] Test: snapshot JSON contains correct vars, formula results, rates

---

## Success Criteria

- After locking: `Payroll.snapshot` is a non-null JSON object with `capturedAt`, `vars`, `formulaResults`, `insuranceRates`, `pitBrackets`, `computed`.
- Calling `calculatePayroll(companyId, employeeId, month)` where month's payroll is LOCKED returns immediately without modifying DB.
- Changing a formula after locking: `markDraftPayrollsStale()` does NOT mark the LOCKED row. `recalculateMonth()` skips it (DRAFT-only filter).
- `lockPayroll()` with `needsRecalc = true` returns `{ ok: false, error: 'Cần cập nhật trước khi khóa' }`.
- Snapshot modal renders all input vars + formula results + final computed values correctly.
- `Payroll.snapshot` field is never overwritten after initial write.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `buildPayrollSnapshot()` fails inside `$transaction()` — transaction rolls back | Low | Medium | Wrap snapshot build OUTSIDE transaction; pass pre-built snapshot INTO transaction |
| Snapshot JSON too large for Postgres JSONB | Very Low | Low | Typical snapshot: <50 formula columns × 100 bytes = ~5KB; well within JSONB 255MB limit |
| Formula results in snapshot differ from Payroll row values (race condition) | Low | Medium | Build snapshot AFTER all mutations in APPROVED state are committed, before transition to LOCKED |
| Legacy LOCKED rows missing snapshot (migrated from before this phase) | Medium | Low | Show "Không có snapshot (dữ liệu cũ)" in modal; don't block reads |

---

## Security Considerations

- `snapshot` is written by `luong.approve` permission only — same as `lockPayroll()`.
- `snapshot` is read-only after write — no update/delete endpoint exposed.
- Snapshot modal requires `luong.view` permission — employees see only own snapshot.
- `snapshot` may contain sensitive salary data — never expose via public API or export without auth check.

---

## Next Steps

Phase 08 (Versioning & Testing) builds on the snapshot concept — `formulaResults[].formulaVersionId` should reference `SalaryColumnVersion.id` once that model exists.
