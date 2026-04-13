# Phase 06 — Quản lý nhân sự (/caidat)

**Parent plan:** [plan.md](./plan.md)
**Dependencies:** Phase 01 (AuthProvider employees state), Phase 05 (nhanvien simplified)
**Date:** 2026-04-12
**Priority:** Medium
**Status:** pending

---

## Overview

Add a "Quản lý nhân sự" tab to `/caidat`. Full CRUD for employees: add, edit, delete, configure salary, role, permissions, account status, and contract type. All mutations via `setEmployees` from AuthProvider. Tab only visible/accessible to Admin/HR roles.

---

## Key Insights

- `/caidat` currently has 3 tabs: `company` | `system` | `salary`. Add a 4th tab: `nhansu`.
- Current tab state is `'company' | 'system' | 'salary'` — extend the union type.
- The CRUD logic already exists in `/nhanvien/page.tsx` — copy the relevant functions and modal, don't rewrite from scratch (DRY-ish: same pattern, different location).
- `/caidat` is protected by `caidat.view` permission. Employee role has `caidat.view`? Check: PG05 (employee) does NOT have `caidat.view` → `/caidat` is inaccessible to employees already. So no need for role-gate inside the page.
- The "Quản lý nhân sự" tab should focus on HR-admin fields: salary config, role, account status, contract type. Less emphasis on contact/personal info (that's already in /nhanvien).

---

## Requirements

1. Add 4th tab `nhansu` to `/caidat` tab bar
2. Tab label: "Quản lý nhân sự", icon: `Users`
3. Tab content: employee table with key HR-admin columns
4. Columns: Nhân viên | Vị trí | Phòng ban | Lương cứng | Vai trò TK | Trạng thái TK | Hợp đồng | Actions
5. Actions per row: Edit (salary, role, accountStatus, contractType), Delete (soft: set status = 'resigned')
6. Add employee modal (same fields as /nhanvien EMPTY_FORM)
7. All mutations via `setEmployees` from `useAuth()`
8. Search by name within tab
9. Permission gate: if `!hasPermission('nhanvien.edit')` → show read-only table, no add/edit/delete buttons

---

## Architecture

### Tab extension

```ts
// Extend tab type from 'company' | 'system' | 'salary'
type SettingsTab = 'company' | 'system' | 'salary' | 'nhansu'
```

### Tab bar addition

```tsx
['nhansu', 'Quản lý nhân sự', <Users key="u" size={13}/>],
```

### HR management tab component

```
HRManagementTab
  ├── Toolbar: search | [+ Thêm nhân viên] (gated by nhanvien.edit)
  ├── Table
  │   └── rows: employees[]
  │       ├── Quick-edit salary (inline or modal)
  │       ├── Role dropdown
  │       ├── Account status badge + toggle
  │       └── Contract type badge
  └── EmployeeModal (add/edit — reuse pattern from /nhanvien)
```

### Key mutations

```ts
// Update employee fields
function updateEmployee(id: string, patch: Partial<Employee>) {
  setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
}

// Soft delete
function removeEmployee(id: string) {
  setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: 'resigned', accountStatus: 'locked' } : e))
}

// Add employee (same as /nhanvien)
function addEmployee(form: Partial<Employee>) {
  const newEmp: Employee = { ...EMPTY_FORM, ...form, id: `E${String(employees.length+1).padStart(3,'0')}`, code: `NV${String(employees.length+1).padStart(3,'0')}` }
  setEmployees(prev => [...prev, newEmp])
}
```

---

## Related Code Files

- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/caidat/page.tsx` — add tab + HR management section
- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/nhanvien/page.tsx` — reference for CRUD patterns/modal to copy
- `/Users/hoahenry/Desktop/nhansu.hl17/src/components/auth/AuthProvider.tsx` — `employees`, `setEmployees`
- `/Users/hoahenry/Desktop/nhansu.hl17/src/types/index.ts` — `Employee` type
- `/Users/hoahenry/Desktop/nhansu.hl17/src/lib/format.ts` — `fmtVND` for salary display

---

## Implementation Steps

1. Open `src/app/caidat/page.tsx`
2. Add `useAuth` import: `{ employees, setEmployees, hasPermission }`
3. Add `type`, `fmtVND` imports
4. Extend `tab` state type to include `'nhansu'`
5. Add `['nhansu', 'Quản lý nhân sự', <Users />]` to tab bar array
6. Add `{tab === 'nhansu' && <HRManagementSection />}` block
7. Implement `HRManagementSection` as an inline component or block within the same file:
   a. `search` state for filtering
   b. `editEmp` state for modal (null = closed)
   c. `showAdd` state for add modal
   d. Filtered employees list
   e. Table with HR-focused columns
   f. Edit modal (salary, role, contractType, accountStatus, accountEmail, accountPassword)
   g. Add employee modal (copy EMPTY_FORM + gen logic from /nhanvien)
8. Implement `updateEmployee`, `removeEmployee`, `addEmployee` handlers
9. Gate add/edit/delete buttons with `hasPermission('nhanvien.edit')`
10. Add `Users` icon import from `lucide-react`

---

## Todo

- [ ] Import `useAuth`, `type Employee`, `fmtVND` in `caidat/page.tsx`
- [ ] Import `Users` icon
- [ ] Extend tab union type to include `'nhansu'`
- [ ] Add tab button to tab bar
- [ ] Add `{tab === 'nhansu' && ...}` render block
- [ ] Implement HR table with search
- [ ] Implement edit modal (HR fields only)
- [ ] Implement add employee modal
- [ ] Implement `updateEmployee` handler
- [ ] Implement `removeEmployee` (soft delete)
- [ ] Implement `addEmployee` handler
- [ ] Gate buttons with `hasPermission('nhanvien.edit')`
- [ ] Verify /caidat permissions — confirm employee cannot access this route

---

## Success Criteria

- Admin navigates to `/caidat` → sees "Quản lý nhân sự" tab
- Can add, edit salary/role/status, and soft-delete employees
- Changes persist across page navigation (via localStorage via AuthProvider)
- `hasPermission('nhanvien.edit') = false` → no add/edit/delete buttons visible
- Employee role cannot reach `/caidat` (existing route guard)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `/caidat/page.tsx` grows large (4 tabs, complex HR section) | Medium | Consider extracting `HRManagementSection` to `components/settings/HRManagementSection.tsx` if > 300 lines |
| ID collision on new employee add | Low | Use `Date.now()` or length-based ID (acceptable for prototype) |
| Deleting an employee breaks their attendance/deduction records | Low | Soft delete only (status: 'resigned'); orphan records are harmless |

---

## Security Considerations

- `/caidat` route already blocked for `employee` role (no `caidat.view` in PG05)
- Edit gate via `hasPermission('nhanvien.edit')` provides defense-in-depth

---

## Next Steps

→ Phase 07: Navigation labels and routing cleanup
