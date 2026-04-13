# Phase 04 — Lương & Thưởng (/luong)

**Parent plan:** [plan.md](./plan.md)
**Dependencies:** Phase 01 (types), Phase 02 (attendance), Phase 03 (deductions)
**Date:** 2026-04-12
**Priority:** High
**Status:** pending

---

## Overview

Redesign `/luong` to auto-calculate salary from dynamic data. Formula: `(công_số_nhận − công_số_trừ) × (baseSalary / 26)`. Month picker; employee sees own payslip; admin sees all. Replaces static `SALARY_DATA` import with live calculation from `attendance` + `deductions` + `employees`.

---

## Key Insights

- Current page imports `SALARY_DATA` (static, pre-computed). New page derives salary on-the-fly from attendance and deductions.
- No persistence of computed salary records — salary is always derived/recalculated. Simpler and consistent with the "no backend" constraint.
- `baseSalary` comes from `employee.salary` (currently `0` for most seed employees — must show `0` gracefully or prompt admin to set salary in /caidat HR tab).
- Only **approved** deductions count in the deduction sum.
- `công_số_nhận` = sum of `WorkUnit.units` for month/employee.
- `công_số_trừ` = sum of `DeductionEvent.delta` (approved) for month/employee. Note: OT events have positive delta, so they reduce net deductions.
- Net công số = `công_số_nhận + công_số_trừ` (deductions already carry sign).
- Calculated pay = `max(0, netCongSo) × (baseSalary / 26)`.

---

## Requirements

1. Remove `SALARY_DATA` import; derive salary rows from `attendance`, `deductions`, `employees` via `useAuth()`
2. Month picker filter (default current month)
3. Employee: sees own payslip row only, column toggle retained
4. Admin/HR: sees all employees
5. Salary row derived type (not `SalaryRecord` — new local type or inline object)
6. Columns: Nhân viên | Lương cứng | Công số nhận | Công số trừ | Công số thực | Tạm tính | Ghi chú
7. Column visibility toggle (existing Eye/EyeOff pattern — keep it)
8. Stats row: Tổng quỹ lương tháng, Số nhân viên có lương, Công số TB

---

## Architecture

### Derived salary row type

```ts
type DerivedPayRow = {
  employeeId: string
  employeeName: string
  department: string
  baseSalary: number
  congSoNhan: number      // sum WorkUnit.units for month
  congSoTru: number       // sum approved DeductionEvent.delta for month (signed)
  netCongSo: number       // congSoNhan + congSoTru
  calculatedPay: number   // max(0, netCongSo) * (baseSalary / 26)
}
```

### Calculation logic

```ts
function buildPayRows(
  month: string,
  targetEmployees: Employee[],
  attendance: WorkUnit[],
  deductions: DeductionEvent[]
): DerivedPayRow[] {
  return targetEmployees.map(emp => {
    const congSoNhan = attendance
      .filter(a => a.employeeId === emp.id && a.date.startsWith(month))
      .reduce((s, a) => s + a.units, 0)

    const congSoTru = deductions
      .filter(d => d.employeeId === emp.id && d.date.startsWith(month) && d.status === 'approved')
      .reduce((s, d) => s + d.delta, 0)

    const netCongSo = congSoNhan + congSoTru  // deductions have negative sign built in
    const calculatedPay = Math.max(0, netCongSo) * (emp.salary / 26)

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      baseSalary: emp.salary,
      congSoNhan,
      congSoTru,
      netCongSo,
      calculatedPay,
    }
  })
}
```

### Component structure

```
LuongPage ('use client')
  ├── Stats row (3 cards)
  ├── Toolbar: month picker | search | column toggle
  ├── Table (derived rows, no SALARY_DATA)
  └── Column picker popover (existing pattern)
```

---

## Related Code Files

- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/luong/page.tsx` — major rewrite
- `/Users/hoahenry/Desktop/nhansu.hl17/src/components/auth/AuthProvider.tsx` — source of all data
- `/Users/hoahenry/Desktop/nhansu.hl17/src/types/index.ts` — `WorkUnit`, `DeductionEvent`
- `/Users/hoahenry/Desktop/nhansu.hl17/src/lib/format.ts` — `fmtVND` for currency display

---

## Implementation Steps

1. Open `src/app/luong/page.tsx`
2. Replace `SALARY_DATA` import; add `useAuth()` destructure: `{ user, employees, attendance, deductions }`
3. Add `monthFilter` state (default current month)
4. Define `DerivedPayRow` as a local type (top of file)
5. Define `buildPayRows` function (pure, no side effects)
6. Compute `targetEmployees`: if employee role → filter to `[employees.find(e => e.id === user.employeeId)]`; else → all employees
7. Compute `payRows = buildPayRows(monthFilter, targetEmployees, attendance, deductions)`
8. Apply `search` filter on `payRows`
9. Update `COLUMNS` constant to match new schema keys
10. Update stats derivation from `payRows`
11. Update table render to use `DerivedPayRow` fields
12. Keep existing column toggle UI (Eye/EyeOff, `visibleCols` state)
13. Update `PageShell` title to "Lương & Thưởng" (unchanged) or keep as-is

---

## Todo

- [ ] Remove `SALARY_DATA` import
- [ ] Add `useAuth()` with attendance, deductions, employees
- [ ] Add `monthFilter` state
- [ ] Define `DerivedPayRow` local type
- [ ] Implement `buildPayRows` pure function
- [ ] Compute `targetEmployees` with role scope
- [ ] Compute `payRows` from `buildPayRows`
- [ ] Update `COLUMNS` constant for new schema
- [ ] Update stats cards from payRows
- [ ] Update table render
- [ ] Retain column visibility toggle
- [ ] Add month picker to toolbar
- [ ] Handle empty state (no attendance data)

---

## Success Criteria

- Employee with `salary: 0` shows `Tạm tính: 0 ₫` (no crash)
- Employee with `salary > 0`, correct công số → correct calculated pay
- Formula `max(0, netCongSo) × (baseSalary / 26)` verified by manual calc
- Month picker changes data correctly
- Column toggle still works
- No TypeScript errors

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `baseSalary = 0` for all seed employees | Medium | Show dash or "—" for pay; note in UI "Chưa cấu hình lương" |
| Division by 26 when salary = 0 | Low | `salary / 26 = 0` is safe, no NaN |
| `netCongSo < 0` (more deductions than attendance) | Low | `Math.max(0, ...)` clamps to 0 |

---

## Security Considerations

- Employee scope enforced in `targetEmployees` computation before any display
- No salary mutation on this page — read-only derived view

---

## Next Steps

→ Phase 05: `/nhanvien` employee self-view profile
