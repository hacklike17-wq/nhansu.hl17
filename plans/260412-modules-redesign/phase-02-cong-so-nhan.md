# Phase 02 — Công số nhận (/chamcong)

**Parent plan:** [plan.md](./plan.md)
**Dependencies:** Phase 01 (WorkUnit type + AuthProvider attendance state)
**Date:** 2026-04-12
**Priority:** High
**Status:** pending

---

## Overview

Redesign `/chamcong` page from a check-in/check-out attendance log to a "Công số nhận" (work units earned) view. Each row is a `WorkUnit` showing units earned per day. Month picker replaces date filter. Employee sees own records; Admin/HR sees all. Admin/HR can manually add or adjust a day's units.

---

## Key Insights

- Current page imports `ATTENDANCE_DATA` from `constants/data.ts` (static). Must switch to `attendance` from `useAuth()`.
- Current filter is by `date` (single day). New filter is by `month` (`YYYY-MM`).
- "Công số nhận" is additive — total for month = sum of all `WorkUnit.units` for that month/employee.
- Admin/HR may need to add a WorkUnit for absent or irregular days (sick with partial pay, etc.).
- Employee role: read-only table, no add/edit.
- The "Tổng tháng" stat card is the most important UI element for employees.

---

## Requirements

1. Remove `ATTENDANCE_DATA` import; read from `useAuth().attendance`
2. Replace date filter with month picker (`YYYY-MM`, default = current month)
3. Filter by month: `date.startsWith(selectedMonth)`
4. Employee: sees only own records, no add button
5. Admin/HR: sees all employees, can add `WorkUnit` via modal, can edit `units` inline
6. Stats row: Tổng công số (sum), Số ngày có công, Số nhân viên (admin only)
7. Table columns: Ngày | Nhân viên (admin only) | Phòng ban (admin only) | Công số | Ghi chú
8. Add modal for Admin/HR: date picker, employee selector, units input (0.5 / 1.0 / 1.5 / custom), note
9. `setAttendance` for mutations; no direct localStorage write in page

---

## Architecture

### Data flow

```
useAuth() → { attendance, setAttendance, user, employees }
  ↓
filtered = attendance
  .filter(month match)
  .filter(role-scope: employee → own only)
  ↓
stats derived from filtered
  ↓
table render
```

### Add WorkUnit

```ts
function addWorkUnit(form: Partial<WorkUnit>) {
  const newUnit: WorkUnit = {
    id: `WU-${Date.now()}`,
    employeeId: form.employeeId!,
    employeeName: employees.find(e => e.id === form.employeeId)?.name ?? '',
    date: form.date!,
    units: form.units ?? 1.0,
    note: form.note ?? '',
  }
  setAttendance(prev => [...prev, newUnit])
}
```

### Component structure

```
ChamCongPage ('use client')
  ├── Stats row (4 cards)
  ├── Toolbar: month picker | search | [+ Thêm công] (admin/hr only)
  ├── Table
  │   └── rows: WorkUnit[]
  └── AddWorkUnitModal (conditional, admin/hr only)
```

---

## Related Code Files

- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/chamcong/page.tsx` — full rewrite
- `/Users/hoahenry/Desktop/nhansu.hl17/src/components/auth/AuthProvider.tsx` — source of `attendance`
- `/Users/hoahenry/Desktop/nhansu.hl17/src/types/index.ts` — `WorkUnit` type

---

## Implementation Steps

1. Open `src/app/chamcong/page.tsx`
2. Replace `ATTENDANCE_DATA` import with `useAuth()` destructure: `{ user, employees, attendance, setAttendance }`
3. Add `monthFilter` state: `useState(new Date().toISOString().slice(0,7))` (default = current month)
4. Remove old `dateFilter` and `deptFilter` states; keep `search`
5. Compute `isEmployee = user?.role === 'employee'`
6. Filter logic:
   ```ts
   const filtered = attendance.filter(r => {
     if (isEmployee && r.employeeId !== user?.employeeId) return false
     if (!r.date.startsWith(monthFilter)) return false
     if (search && !r.employeeName.toLowerCase().includes(search.toLowerCase())) return false
     return true
   })
   ```
7. Stats: `totalUnits = filtered.reduce((s,r) => s + r.units, 0)`, `daysWorked = filtered.length`, etc.
8. Update toolbar: replace date input with `<input type="month">`, add "+ Thêm công" button gated by `!isEmployee`
9. Update table columns to match new schema (drop checkIn/checkOut/status, add `units`)
10. Add `AddWorkUnitModal` component inline (same modal pattern as existing nhanvien page)
11. Implement `addWorkUnit` handler calling `setAttendance`
12. Update `PageShell` title to "Công số nhận"

---

## Todo

- [ ] Replace static import with `useAuth()` attendance
- [ ] Add `monthFilter` state (default current month)
- [ ] Update filter logic (month + role scope)
- [ ] Rewrite stats cards (totalUnits, daysWorked, avgUnits)
- [ ] Add month picker to toolbar
- [ ] Gate "+ Thêm công" button to admin/hr
- [ ] Rewrite table columns for WorkUnit schema
- [ ] Add `AddWorkUnitModal` inline component
- [ ] Implement `addWorkUnit` → `setAttendance`
- [ ] Update page title to "Công số nhận"
- [ ] Remove `ATTENDANCE_DATA` import

---

## Success Criteria

- Employee logs in → sees own records for current month, total công số shown
- Admin logs in → sees all employees for selected month, can add a WorkUnit
- Auto-added WorkUnit from Phase 01 appears in the table on first load
- Month picker changes the table correctly
- No TypeScript errors

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `attendance` empty on first load (no seed) | Medium | Show empty state "Chưa có dữ liệu" + helpful note |
| Admin adds duplicate WorkUnit for same day/employee | Low | Warn if duplicate exists; allow but note it |

---

## Security Considerations

- Employee scope is enforced in page filter, not in context — consistent with existing pattern
- Admin can add WorkUnit for any employee — acceptable for prototype

---

## Next Steps

→ Phase 03: `/nghiphep` redesign as "Công số trừ" event log
