# Phase 05 — Manual Inputs in Payroll

**Parent:** `plan.md`
**Dependencies:** Phase 03 (data sync — recalc after input), Phase 04 (employee in month)

---

## Overview

- **Date:** 2026-04-12
- **Description:** Allow HR to manually enter per-employee values for phụ cấp (allowance), thưởng (bonus), and phạt (deduction) directly in the payroll table. These values are persisted as `SalaryValue` records and feed into formula evaluation.
- **Priority:** High
- **Complexity:** S
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- The schema already has `SalaryValue` model with `columnKey` — this is the right place to store per-employee manual inputs for a specific month.
- The `Payroll` model also has dedicated columns: `tienPhuCap`, `thuong`, `tienPhat`, `bonus`. Decision: store the raw inputs in `SalaryValue` (source of truth) AND reflect them in the `Payroll` row's dedicated columns when calculating. This avoids creating extra SalaryColumn rows for system-level inputs.
- Formula columns can reference `phu_cap`, `thuong`, `phat` as variable names — `calculatePayroll()` must inject `SalaryValue` entries into the `vars` map before evaluating formula columns.
- Inline editing in the table (click cell → input → blur to save) is better UX than a separate modal for these small numeric inputs.
- Only DRAFT payrolls can have manual inputs edited. PENDING+ = read-only.

---

## Requirements

1. Payroll table rows show editable cells for: `tienPhuCap`, `thuong`, `tienPhat`, `bonus` (only for DRAFT status).
2. Editing a cell and blurring triggers a Server Action to save the `SalaryValue` for that employee+month+key.
3. After saving, `calculatePayroll()` is called for that employee+month → net salary updates.
4. PENDING/APPROVED/LOCKED/PAID rows show these cells as read-only (display only).
5. `calculatePayroll()` injects manual input values into `vars` before evaluating formula columns: `vars.phu_cap = tienPhuCap, vars.thuong = thuong, vars.phat = tienPhat`.
6. `SalaryValue` records are created/updated via upsert (idempotent).
7. Currency formatting applied to displayed values (`fmtVND`).

---

## Architecture

### Variable mapping

```
SalaryValue.columnKey   →   vars variable name   →   Payroll field
'phu_cap'               →   phu_cap              →   tienPhuCap
'thuong'                →   thuong               →   bonus
'phat'                  →   phat                 →   tienPhat
'kpi_chuyen_can'        →   kpi_chuyen_can       →   kpiChuyenCan
'kpi_trach_nhiem'       →   kpi_trach_nhiem      →   kpiTrachNhiem
```

These keys must be in `SYSTEM_VARS_KEYS` so formula columns can reference them.

### Editable cell component

```tsx
// PayrollEditableCell.tsx — 'use client'
function EditableCell({ value, payrollId, columnKey, month, disabled }) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(String(value ?? 0))
  const [isPending, startTransition] = useTransition()

  function handleBlur() {
    setEditing(false)
    const num = parseInt(localVal.replace(/\D/g, ''), 10) || 0
    startTransition(() => saveManualInput(payrollId, columnKey, month, num))
  }

  if (disabled) return <span className="text-gray-500">{fmtVND(value)}</span>

  return editing
    ? <input autoFocus type="text" value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => e.key === 'Enter' && handleBlur()}
        className="w-28 border rounded px-2 py-0.5 text-right text-sm" />
    : <span onClick={() => setEditing(true)}
        className="cursor-pointer hover:bg-blue-50 px-2 py-0.5 rounded text-sm">
        {fmtVND(value)}
      </span>
}
```

### Server Action: saveManualInput

```typescript
// luong/actions.ts
'use server'
export async function saveManualInput(
  payrollId: string,
  columnKey: string,
  month: string,
  value: number,
) {
  const session = await auth()
  if (!session || !hasPermission(session.user.permissions, 'luong.edit'))
    return { ok: false, error: 'Không có quyền' }

  const companyId = session.user.companyId!

  // Verify payroll is DRAFT and belongs to company
  const payroll = await db.payroll.findFirst({ where: { id: payrollId, companyId } })
  if (!payroll) return { ok: false, error: 'Không tìm thấy' }
  if (payroll.status !== 'DRAFT') return { ok: false, error: 'Chỉ sửa được bản lương DRAFT' }

  const monthDate = new Date(`${month}-01`)

  // Upsert SalaryValue
  await db.salaryValue.upsert({
    where: { employeeId_month_columnKey: { employeeId: payroll.employeeId, month: startOfMonth(monthDate), columnKey } },
    update: { value },
    create: { companyId, employeeId: payroll.employeeId, month: startOfMonth(monthDate), columnKey, value },
  })

  // Recalculate payroll with new input
  await payrollService.calculatePayroll(companyId, payroll.employeeId, monthDate)

  revalidateTag(`payroll-${companyId}-${month}`)
  return { ok: true }
}
```

### Injecting manual inputs into calculatePayroll

```typescript
// payroll.service.ts — inside calculatePayroll()

// After loading salaryValues:
const manualInputKeys = ['phu_cap', 'thuong', 'phat', 'kpi_chuyen_can', 'kpi_trach_nhiem']
const manualVars = Object.fromEntries(
  salaryValues
    .filter(sv => manualInputKeys.includes(sv.columnKey))
    .map(sv => [sv.columnKey, Number(sv.value)])
)

// Base vars (before formula eval)
const vars: Record<string, number> = {
  luong_co_ban: baseSalary,
  cong_so_nhan: congSoNhan,
  cong_so_tru: congSoTru,
  net_cong_so: netWorkUnits,
  gio_tang_ca: overtimeHours,
  kpi_score: kpiScore,
  ...manualVars,   // ← inject manual inputs as formula variables
}

// Then evaluate formula columns in topological order
// Then map back to Payroll fields:
const payrollData = {
  tienPhuCap: manualVars['phu_cap'] ?? 0,
  thuong: manualVars['thuong'] ?? 0,
  tienPhat: manualVars['phat'] ?? 0,
  // ... other fields from formula eval
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/app/luong/actions.ts` | Modify | Add `saveManualInput()` |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Add `EditableCell` for phu_cap/thuong/phat |
| `src/app/luong/components/PayrollEditableCell.tsx` | Create | Inline editable cell component |
| `src/lib/services/payroll.service.ts` | Modify | Inject manualVars into vars before formula eval |
| `src/constants/salary.ts` | Modify | Add manual input keys to SYSTEM_VARS_KEYS |

---

## Implementation Steps

1. Add `'phu_cap'`, `'thuong'`, `'phat'`, `'kpi_chuyen_can'`, `'kpi_trach_nhiem'` to `SYSTEM_VARS_KEYS` constant.
2. In `payroll.service.ts:calculatePayroll()`: after loading `salaryValues`, extract manual input keys and inject into `vars` map.
3. Map manual vars back to Payroll update fields (`tienPhuCap = manualVars.phu_cap ?? 0`, etc.).
4. Write `saveManualInput(payrollId, columnKey, month, value)` Server Action.
5. Create `PayrollEditableCell.tsx` component (click → input → blur → save → recalc).
6. Update `PayrollTable.tsx`: render `EditableCell` for `tienPhuCap`, `thuong`, `tienPhat`, `bonus` columns; disabled if status !== 'DRAFT'.
7. Ensure `fmtVND()` used in display mode; plain number parsed on save.
8. Test: enter phụ cấp 500,000 → net salary increases by 500,000 (assuming formula `net = gross + phu_cap - ...`).

---

## Todo List

- [ ] Add manual input keys to SYSTEM_VARS_KEYS
- [ ] Inject manualVars into calculatePayroll() vars
- [ ] Map manualVars back to Payroll Decimal fields
- [ ] Write saveManualInput Server Action
- [ ] Create PayrollEditableCell.tsx
- [ ] Add editable cells to PayrollTable for phu_cap, thuong, phat, bonus
- [ ] Disable cells for non-DRAFT payrolls
- [ ] Test: phụ cấp input → recalc → net salary updated in UI

---

## Success Criteria

- Clicking phụ cấp cell on a DRAFT payroll row shows an editable input.
- Entering 500000 and pressing Enter → net salary recalculates and updates.
- Same cell on a PENDING payroll is read-only (no click handler).
- `SalaryValue` row created in DB with `columnKey = 'phu_cap'` after save.
- `Payroll.tienPhuCap` field updated to 500000 after recalc.
- Formula column referencing `phu_cap` gets the correct value in evaluation.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User enters non-numeric characters | Medium | Low | Strip non-digits on blur before parsing |
| Stale optimistic UI after failed save | Low | Low | Use `useTransition` — revalidation restores correct value |
| phu_cap variable conflict with formula column named 'phu_cap' | Low | High | Document that manual input keys are reserved; block creating SalaryColumn with these keys |

---

## Security Considerations

- `luong.edit` permission required for saveManualInput.
- Verify payroll `companyId` matches session before updating SalaryValue.
- `value` is parsed as integer — no SQL injection risk with Prisma parameterized queries.

---

## Next Steps

Phase 6 standardizes the variable naming system and ensures backend is the single calculation source.
