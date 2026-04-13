# Phase 05 — Hồ sơ nhân viên (/nhanvien)

**Parent plan:** [plan.md](./plan.md)
**Dependencies:** Phase 01 (AuthProvider employees state)
**Date:** 2026-04-12
**Priority:** Medium
**Status:** pending

---

## Overview

Redesign `/nhanvien` with role-based views. Employee role: read-only profile card of own data with toggle for sensitive fields. Admin/HR: full CRUD management table (existing behavior, but data from AuthProvider not static). The full CRUD management capability moves to `/caidat` "Quản lý nhân sự" tab in Phase 06 — `/nhanvien` for Admin/HR becomes a directory/read view.

---

## Key Insights

- Current page already reads `employees` from `useAuth()` context and has full CRUD. The problem is that it shows the same management view to employees (they just see themselves filtered).
- The employee self-view needs a distinct UX — a profile card layout, not a management table.
- Toggle for sensitive fields: bank account, tax code, social insurance, salary — these should be hidden by default and revealable by click.
- Admin/HR: current table + CRUD is largely fine. In Phase 06, full CRUD moves to `/caidat`. This page becomes a read-only roster for admin (simplified).
- Decision: keep Add/Edit/Delete on `/nhanvien` for now; Phase 06 will duplicate CRUD into `/caidat`. When Phase 06 is done, remove CRUD from `/nhanvien`. Plan phases sequentially to avoid breaking changes.

---

## Requirements

### Employee role view
1. Show own profile as a card layout (not a table row)
2. Fields: name, code, position, department, role, status, joinDate, contractType, phone, email, dob, gender, address
3. Sensitive fields (salary, bankAccount, bankName, taxCode, socialInsurance) — hidden behind toggle button
4. No edit capability (read-only)
5. Profile avatar with initials (reuse existing `getInitials`/`avatarColor` helpers)

### Admin/HR view
1. Existing table layout retained (data from `useAuth().employees` — already the case)
2. Remove full CRUD from this page (defer to Phase 06); keep search + filter + read-only row detail view
3. Or: keep CRUD here and also add in /caidat (duplicate) — simpler, less risky for phased delivery
4. **Decision: keep existing CRUD on /nhanvien as-is; Phase 06 adds equivalent CRUD to /caidat**

---

## Architecture

### Role-branch logic

```tsx
export default function NhanVienPage() {
  const { user, employees } = useAuth()
  const isEmployee = user?.role === 'employee'

  if (isEmployee) {
    const myProfile = employees.find(e => e.id === user?.employeeId)
    return <EmployeeProfileView employee={myProfile} />
  }

  return <AdminEmployeeTable />  // existing component logic
}
```

### EmployeeProfileView component

```tsx
function EmployeeProfileView({ employee }: { employee: Employee | undefined }) {
  const [showSensitive, setShowSensitive] = useState(false)
  // ...
  return (
    <PageShell breadcrumb="Nhân sự" title="Hồ sơ của tôi">
      <div className="max-w-2xl">
        {/* Avatar + name + position header card */}
        {/* Info grid: public fields */}
        {/* Sensitive section: collapsed by default */}
        <button onClick={() => setShowSensitive(s => !s)}>
          {showSensitive ? <EyeOff /> : <Eye />} Thông tin tài chính
        </button>
        {showSensitive && (
          <div>
            {/* salary, bank, tax, insurance */}
          </div>
        )}
      </div>
    </PageShell>
  )
}
```

### Sensitive fields mask

- Default hidden: show as `••••••••`
- On toggle: show actual value
- No edit → no security concern; just UX clarity

---

## Related Code Files

- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/nhanvien/page.tsx` — add employee self-view branch
- `/Users/hoahenry/Desktop/nhansu.hl17/src/components/auth/AuthProvider.tsx` — source of `employees`
- `/Users/hoahenry/Desktop/nhansu.hl17/src/types/index.ts` — `Employee` type

---

## Implementation Steps

1. Open `src/app/nhanvien/page.tsx`
2. Identify the existing `NhanVienPage` component structure
3. Extract existing admin table logic into an `AdminView` inner section (or keep inline, just branch early)
4. Add early return branch: if `isEmployee` → render `<EmployeeProfileView>`
5. Implement `EmployeeProfileView` component:
   a. Find employee record: `employees.find(e => e.id === user.employeeId)`
   b. Handle undefined (loading state)
   c. Render avatar card: `getInitials`, `avatarColor` (reuse existing helpers from the same file)
   d. Render info grid (public fields: 2-col grid, same style as existing cards)
   e. Render sensitive toggle section
6. Add `showSensitive` state for the toggle
7. Ensure `PageShell` title changes to "Hồ sơ của tôi" for employee view

---

## Todo

- [ ] Add `isEmployee` branch in `NhanVienPage`
- [ ] Implement `EmployeeProfileView` sub-component
- [ ] Find own employee record from context
- [ ] Render avatar card with initials
- [ ] Render public info grid
- [ ] Add sensitive field toggle (`showSensitive` state)
- [ ] Render sensitive fields section (salary, bank, tax, insurance)
- [ ] Handle `employee === undefined` gracefully
- [ ] Keep existing admin table path untouched

---

## Success Criteria

- Employee navigates to `/nhanvien` → sees own profile card, not a table
- Sensitive fields hidden by default; revealed on toggle click
- Admin navigates to `/nhanvien` → existing table view unchanged
- No TypeScript errors

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `employee.salary = 0` (all seed employees) | Low | Show "Chưa cấu hình" or `0 ₫` |
| Employee record not found in context | Low | Show skeleton/loading state |

---

## Security Considerations

- Employee cannot edit own record — view is read-only
- Sensitive field toggle is purely cosmetic (data is in localStorage anyway)

---

## Next Steps

→ Phase 06: `/caidat` new "Quản lý nhân sự" tab with full CRUD
