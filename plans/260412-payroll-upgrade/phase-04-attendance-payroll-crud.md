# Phase 04 — Attendance & Payroll CRUD

**Parent:** `plan.md`
**Dependencies:** Phase 03 (data sync), Production Migration Phase 4 (HR modules)

---

## Overview

- **Date:** 2026-04-12
- **Description:** Allow HR to add/remove employees directly in the attendance and payroll tables for a given month, and keep the employee roster consistent across WorkUnit, Payroll, and Employee tables.
- **Priority:** High
- **Complexity:** M
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Currently the attendance (chấm công) table likely shows all employees with pre-generated rows. When a new employee joins mid-month, they must be manually added to the attendance table for that month — no automated way to do this.
- "Add employee to month" = create empty `WorkUnit` row (0 units) for that employee for each working day, OR generate the `Payroll` row with 0 công số and DRAFT status.
- Simpler approach: "Thêm vào bảng tháng này" creates one `WorkUnit` row with `units = 0` for the current date (or month start). HR then edits daily attendance. This avoids bulk-creating 20+ rows.
- Remove employee from month = soft-remove: delete all their `WorkUnit` rows for that month (only if no associated APPROVED payroll). Do NOT delete the `Employee` record.
- Sync: "Thêm tất cả nhân viên đang làm" button creates Payroll DRAFT rows for all active employees without a payroll row for that month.
- Employee status `WORKING` or `HALF` or `REMOTE` = eligible for payroll generation. `RESIGNED`/`LEAVE` with `deletedAt` set = excluded.

---

## Requirements

1. Attendance table: "Thêm nhân viên" button → dropdown of active employees NOT already in this month's attendance → add WorkUnit row.
2. Attendance table: each row has "Xóa" to remove all WorkUnits for that employee for the month (only if DRAFT or no payroll).
3. Payroll table: "Tạo bảng lương tháng này" button → create DRAFT Payroll rows for all active employees without a Payroll for this month.
4. Payroll table: "Thêm nhân viên" button → add one employee's DRAFT Payroll row manually.
5. Payroll table: "Xóa" row → delete only DRAFT Payrolls (PENDING+ = blocked with error message).
6. Employee list stays consistent: active employees (not deleted) are the source of truth.
7. Department filter on attendance/payroll tables filters within already-loaded rows (client-side).

---

## Architecture

### File structure

```
src/app/chamcong/
  actions.ts       — add: addEmployeeToMonth(), removeEmployeeFromMonth()
  components/
    AttendanceTable.tsx  — add: "Thêm NV" button + per-row delete

src/app/luong/
  actions.ts       — add: generateMonthPayroll(), addEmployeePayroll(), deletePayroll()
  components/
    PayrollTable.tsx     — add: "Tạo bảng lương" button + "Thêm NV" + per-row delete
```

### Server Action: addEmployeeToMonth (chamcong)

```typescript
// chamcong/actions.ts
export async function addEmployeeToMonth(employeeId: string, month: string) {
  const session = await auth()
  if (!hasPermission(session?.user.permissions, 'chamcong.edit'))
    return { ok: false, error: 'Không có quyền' }

  const companyId = session!.user.companyId!
  const monthDate = new Date(`${month}-01`)

  // Check employee belongs to company
  const employee = await db.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
  })
  if (!employee) return { ok: false, error: 'Nhân viên không tồn tại' }

  // Create a placeholder WorkUnit for first day of month
  await db.workUnit.upsert({
    where: { employeeId_date: { employeeId, date: startOfMonth(monthDate) } },
    update: {},  // already exists — no-op
    create: { companyId, employeeId, date: startOfMonth(monthDate), units: 0 },
  })

  revalidateTag(`attendance-${companyId}-${month}`)
  return { ok: true }
}
```

### Server Action: generateMonthPayroll (luong)

```typescript
// luong/actions.ts
export async function generateMonthPayroll(month: string) {
  const session = await auth()
  if (!hasPermission(session?.user.permissions, 'luong.edit'))
    return { ok: false, error: 'Không có quyền' }

  const companyId = session!.user.companyId!
  const monthDate = new Date(`${month}-01`)

  // Find active employees without a Payroll for this month
  const allActive = await db.employee.findMany({
    where: { companyId, deletedAt: null, status: { in: ['WORKING', 'HALF', 'REMOTE'] } },
    select: { id: true },
  })

  const existingPayrolls = await db.payroll.findMany({
    where: { companyId, month: startOfMonth(monthDate) },
    select: { employeeId: true },
  })

  const existingSet = new Set(existingPayrolls.map(p => p.employeeId))
  const toCreate = allActive.filter(e => !existingSet.has(e.id))

  await Promise.all(
    toCreate.map(e => payrollService.calculatePayroll(companyId, e.id, monthDate))
  )

  revalidateTag(`payroll-${companyId}-${month}`)
  return { ok: true, created: toCreate.length }
}
```

### Server Action: deletePayroll (luong)

```typescript
export async function deletePayroll(payrollId: string) {
  const session = await auth()
  if (!hasPermission(session?.user.permissions, 'luong.edit'))
    return { ok: false, error: 'Không có quyền' }

  const companyId = session!.user.companyId!

  const payroll = await db.payroll.findFirst({ where: { id: payrollId, companyId } })
  if (!payroll) return { ok: false, error: 'Không tìm thấy' }
  if (payroll.status !== 'DRAFT') return { ok: false, error: 'Chỉ xóa được bản lương DRAFT' }

  await db.payroll.delete({ where: { id: payrollId } })

  revalidateTag(`payroll-${companyId}-${payroll.month.toISOString().slice(0, 7)}`)
  return { ok: true }
}
```

### UI — "Thêm nhân viên" in AttendanceTable

```tsx
// AttendanceTable.tsx (simplified)
function AddEmployeeToMonthButton({ month, presentEmployeeIds, allEmployees }) {
  const [open, setOpen] = useState(false)
  const available = allEmployees.filter(e => !presentEmployeeIds.has(e.id))

  return (
    <>
      <button onClick={() => setOpen(true)} className="...">+ Thêm nhân viên</button>
      {open && (
        <div className="..."> {/* dropdown */}
          {available.map(e => (
            <button key={e.id} onClick={() => {
              startTransition(() => addEmployeeToMonth(e.id, month))
              setOpen(false)
            }}>
              {e.fullName} — {e.department}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/app/chamcong/actions.ts` | Modify | Add addEmployeeToMonth, removeEmployeeFromMonth |
| `src/app/chamcong/components/AttendanceTable.tsx` | Modify | Add employee picker + row delete |
| `src/app/luong/actions.ts` | Modify | Add generateMonthPayroll, addEmployeePayroll, deletePayroll |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Add generate button + employee picker + row delete |
| `src/lib/services/payroll.service.ts` | Modify | generateMonthPayroll() helper |

---

## Implementation Steps

1. In `payroll.service.ts`: add `generateForMissingEmployees(companyId, month)` that finds active employees without Payroll rows for that month and creates DRAFT rows.
2. In `luong/actions.ts`: add `generateMonthPayroll(month)` + `deletePayroll(payrollId)` Server Actions.
3. Update `PayrollTable.tsx`: add "Tạo bảng lương tháng này" button with `useTransition` + result toast ("Đã tạo X bản lương").
4. Update `PayrollTable.tsx`: add per-row delete button (only renders if `status === 'DRAFT'`).
5. In `chamcong/actions.ts`: add `addEmployeeToMonth(employeeId, month)` + `removeEmployeeFromMonth(employeeId, month)` (delete WorkUnits + check no approved payroll).
6. Update `AttendanceTable.tsx`: fetch list of all active employees from props; render "Thêm nhân viên" picker showing employees not in current month.
7. Update `AttendanceTable.tsx`: per-row "Xóa" button calls `removeEmployeeFromMonth`.
8. Pass `allActiveEmployees` from Server Component page to client table components.

---

## Todo List

- [ ] Add `generateForMissingEmployees()` to payroll.service.ts
- [ ] Add `generateMonthPayroll()` Server Action (luong)
- [ ] Add `deletePayroll()` Server Action — block non-DRAFT
- [ ] Add "Tạo bảng lương tháng này" button to PayrollTable
- [ ] Add per-row delete to PayrollTable (DRAFT only)
- [ ] Add `addEmployeeToMonth()` Server Action (chamcong)
- [ ] Add `removeEmployeeFromMonth()` Server Action (check no approved payroll)
- [ ] Add employee picker to AttendanceTable
- [ ] Pass allActiveEmployees from page.tsx to AttendanceTable
- [ ] Test: add new employee → appears in attendance + payroll tables
- [ ] Test: delete DRAFT payroll → removed from table
- [ ] Test: attempt delete PENDING payroll → error toast

---

## Success Criteria

- "Tạo bảng lương tháng này" creates DRAFT rows for all active employees not yet in the month.
- Adding an employee to attendance table creates a WorkUnit placeholder row.
- Removing an employee from attendance deletes their WorkUnits for the month.
- Deleting a PENDING payroll returns error "Chỉ xóa được bản lương DRAFT".
- Employee list in picker excludes already-added employees and resigned/deleted employees.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Remove attendance with approved payroll | Low | High | Check payroll status before deleting WorkUnits; block with error |
| Generate payroll for LEAVE-status employees | Medium | Low | Filter by status IN ['WORKING','HALF','REMOTE'] |
| Orphan payroll row after employee soft-delete | Low | Medium | Payroll keeps employeeId FK — still valid, just employee is deleted |

---

## Security Considerations

- `chamcong.edit` required for attendance CRUD.
- `luong.edit` required for payroll generate/delete.
- Employee picker fetches only employees with same `companyId` as session.
- Delete Payroll: verify `companyId` matches session before delete.

---

## Next Steps

Phase 5 handles manual inputs (phụ cấp, thưởng, phạt) per employee directly in the payroll table.
