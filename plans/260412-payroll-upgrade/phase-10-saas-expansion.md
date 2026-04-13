# Phase 10 — SaaS Expansion

**Parent:** `plan.md`
**Dependencies:** Phase 07 (full workflow), Phase 09 (anomaly + export done)

---

## Overview

- **Date:** 2026-04-12
- **Description:** Audit and harden multi-company data isolation, refine RBAC for payroll-specific roles (HR vs. accountant vs. employee), and verify the `companyId` boundary is enforced throughout the payroll system.
- **Priority:** Low
- **Complexity:** S
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- The schema already has `companyId` on every table — good. Phase 10 is a **verification and hardening** pass, not a schema redesign.
- No new `organizationId` field needed — `companyId` is the tenant key.
- RBAC gaps specific to payroll:
  - `hr_manager`: should generate payroll + send to pending, but NOT approve or lock (finance role).
  - `accountant`: should approve + lock + export, but NOT edit attendance.
  - `employee`: reads own payslip only — `/luong` page must scope to `employeeId === session.user.employeeId`.
- The permission matrix in `constants/data.ts` must be audited against these business rules.
- Multi-company (multiple Company rows): the system already supports it technically. The UI only shows data for `session.user.companyId`. No UI change needed — just confirm service layer always uses `companyId` from session.

---

## Requirements

1. **RBAC audit for payroll module:**
   - `luong.view`: all roles except employee (employee uses `luong.view` scoped to own)
   - `luong.edit`: hr_manager + admin + boss_admin (generate, add employee, send to pending)
   - `luong.approve`: accountant + admin + boss_admin (approve, lock, mark paid)
   - `luong.export`: accountant + admin + boss_admin
2. **Employee payslip scoping**: `/luong/page.tsx` checks `session.user.role === 'employee'` → fetch only that employee's Payroll rows.
3. **companyId audit**: every `db.payroll.*`, `db.workUnit.*`, `db.salaryColumn.*` call in service layer must include `companyId` in `where` clause.
4. **No companyId from request**: verify no action reads `companyId` from form data or query string — always from `session.user.companyId`.
5. **SalaryColumn isolation**: salary column config scoped to companyId — two companies can have columns with same key, no conflict.

---

## Architecture

### Updated permission matrix (payroll-specific)

```typescript
// constants/data.ts — update permission group definitions

const PERMISSION_GROUPS = {
  boss_admin: ['*'],

  admin: [
    'luong.view', 'luong.edit', 'luong.approve', 'luong.export',
    'chamcong.view', 'chamcong.edit',
    // ... all other modules
  ],

  hr_manager: [
    'luong.view', 'luong.edit',       // generate + send to pending ONLY
    'chamcong.view', 'chamcong.edit',
    // NOT: luong.approve, luong.export
  ],

  accountant: [
    'luong.view', 'luong.approve', 'luong.export',  // approve + export ONLY
    'chamcong.view',                                  // read-only attendance
    // NOT: luong.edit, chamcong.edit
  ],

  employee: [
    'luong.view',     // own payslip only (enforced in service/page)
    'chamcong.view',  // own attendance only
    'nghiphep.*',     // own leave requests
  ],
}
```

### Employee payslip scoping in /luong/page.tsx

```typescript
// luong/page.tsx
export default async function LuongPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await auth()
  if (!session) redirect('/login')

  const companyId = session.user.companyId!
  const isEmployee = session.user.role === 'employee'
  const month = searchParams.month ?? format(new Date(), 'yyyy-MM')

  const payrolls = isEmployee
    ? await payrollService.listForEmployee(companyId, session.user.employeeId!, new Date(`${month}-01`))
    : await payrollService.listByMonth(companyId, new Date(`${month}-01`))

  return <PayrollTable payrolls={payrolls} session={session} />
}
```

### companyId audit — service layer checklist

```typescript
// Every service function must pattern-match:
// ✓ db.payroll.findMany({ where: { companyId, ... } })
// ✓ db.salaryColumn.findMany({ where: { companyId } })
// ✓ db.workUnit.findMany({ where: { companyId, ... } })
// ✓ db.salaryValue.findMany({ where: { companyId, ... } })
// ✗ db.payroll.findMany({ where: { month } })  ← MISSING companyId — security bug
```

### Audit script (grep)

```bash
# Find service calls that might be missing companyId
grep -n "db\.\(payroll\|salaryColumn\|salaryValue\|workUnit\|deductionEvent\)\.find" \
  src/lib/services/*.ts | grep -v "companyId"
```

### listForEmployee (employee payslip)

```typescript
// payroll.service.ts — new function
async listForEmployee(companyId: string, employeeId: string, month: Date) {
  return db.payroll.findMany({
    where: { companyId, employeeId, month: startOfMonth(month) },
    include: { employee: { select: { fullName: true, code: true } } },
  })
}
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `src/constants/data.ts` | Modify | Update PERMISSION_GROUPS for hr_manager / accountant |
| `src/app/luong/page.tsx` | Modify | Employee scoping: role=employee → own payroll only |
| `src/lib/services/payroll.service.ts` | Modify | Add listForEmployee(); audit all queries for companyId |
| `src/lib/services/*.service.ts` | Audit | All service files — grep for missing companyId in where |
| `src/app/luong/actions.ts` | Audit | Verify companyId always from session |

---

## Implementation Steps

1. Update `PERMISSION_GROUPS` in `constants/data.ts`:
   - `hr_manager`: add `luong.edit`, remove `luong.approve`.
   - `accountant`: add `luong.approve`, `luong.export`; remove `luong.edit`.
   - `employee`: keep `luong.view` only.
2. Write `payrollService.listForEmployee(companyId, employeeId, month)`.
3. Update `/luong/page.tsx`: add `isEmployee` check → call `listForEmployee()` for employees.
4. Run audit grep on all service files — add `companyId` to any query missing it.
5. Verify no action reads `companyId` from `formData` or `searchParams` — all from session.
6. Seed updated permission groups into DB (update `prisma/seeds/03-permission-groups.ts`).
7. Test: log in as employee → /luong shows only own payslip. Log in as hr_manager → "Duyệt" button absent. Log in as accountant → "Duyệt" button present, attendance edit buttons absent.

---

## Todo List

- [ ] Update PERMISSION_GROUPS for hr_manager (no luong.approve)
- [ ] Update PERMISSION_GROUPS for accountant (luong.approve + luong.export, no luong.edit)
- [ ] Write listForEmployee() in payroll.service.ts
- [ ] Update /luong/page.tsx: employee scoping
- [ ] Run companyId audit grep on all service files
- [ ] Fix any missing companyId in where clauses
- [ ] Verify no companyId from request body/query
- [ ] Update seed: 03-permission-groups.ts
- [ ] Test: employee sees only own payslip
- [ ] Test: hr_manager cannot approve
- [ ] Test: accountant cannot edit attendance

---

## Success Criteria

- Employee logged in: `/luong` shows only their own payslip row.
- HR manager: "Duyệt" and "Khóa" buttons not rendered (permission check fails silently).
- Accountant: cannot call `generateMonthPayroll()` — Server Action returns "Không có quyền".
- grep audit: zero service queries missing `companyId` in `where`.
- Two companies with employees: Company A payroll never includes Company B data.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Permission change breaks existing users' session | Medium | Medium | Permissions loaded at login — existing sessions unaffected until next login |
| Service query missing companyId found in audit | Medium | High | Immediate fix before production deploy |
| Employee with null employeeId in session | Low | Medium | Guard in listForEmployee: if !employeeId return [] |

---

## Security Considerations

- **Critical:** `companyId` from session is the tenant boundary — a missing `companyId` in any service query is a data breach risk.
- **RBAC enforcement** must be in Server Actions (server-side), not only in UI (can be bypassed by direct API call).
- **Employee self-service**: `/luong` page + `listForEmployee()` must BOTH check employeeId — page for UX, service for security.

---

## Unresolved Questions

- Should `hr_manager` be allowed to view other employees' payslips (currently assumed yes for their company)?
- Is there a planned multi-company admin UI (a "super-admin" who manages multiple Company records)? If so, Phase 10 only handles existing single-company UI.

---

## Next Steps

All 10 phases complete. After Phase 10, the payroll system is:
- Calculation-correct (Phase 1)
- Configurable without hardcoded vars (Phase 2)
- Always in sync with attendance (Phase 3)
- Fully CRUD-enabled (Phase 4+5)
- Backend-authoritative (Phase 6)
- Auditable and immutable after locking (Phase 7)
- Versioned and tested (Phase 8)
- Exportable with anomaly detection (Phase 9)
- Multi-tenant safe and RBAC-compliant (Phase 10)
