# Phase 04 — HR Modules: Employee, Attendance, Leave, Payroll

**Parent:** `plan.md`
**Dependencies:** Phase 01 (schema), Phase 02 (auth), Phase 03 (API pattern), Phase 07 partial (seed data in DB)
**Research refs:** `research/researcher-02-schema-design.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Migrate the four core HR modules from localStorage/constants to DB-backed Server Components + Server Actions. Each module gets: service layer, API routes, Server Actions for mutations, and updated page component fetching from DB.
- **Priority:** High
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Pages in Next.js 16 are Server Components by default — `page.tsx` can call `db` directly via service, no API round-trip needed for initial render.
- Only interactive client components (modals, forms, filters) need `'use client'` — extract these as sub-components.
- Payroll calculation runs entirely server-side in `payroll.service.ts` — uses DB PITBracket + InsuranceRate, not hardcoded constants. `src/lib/formula.ts` remains for formula column evaluation.
- Employee `role` field in current types maps to `User.role` (auth) — keep separate from `Employee.position` (job title). The migration must reconcile this.
- `SalaryColumn` and `SalaryValue` (dynamic formula columns) are stored in DB — `payroll.service.ts` evaluates them using `evalFormula()` from `src/lib/formula.ts`.
- Attendance page (chấm công) currently shows `WorkUnit` records. After migration: Server Component fetches by month/employee from DB; mutations use Server Actions.
- Leave approval là Server Action trong `db.$transaction()` — cập nhật LeaveRequest + tạo batch DeductionEvents (1 row/ngày) + ghi AuditLog. Reject xóa batch DeductionEvents nếu có.
- Payroll approval **single-level**: DRAFT → PENDING → APPROVED → PAID. `luong.edit` guard PENDING transition; `luong.approve` guard APPROVED + PAID. Mỗi transition ghi AuditLog.
- **Concurrency guard:** tất cả approval Server Actions dùng `updateMany` + kiểm tra `count===0` để phát hiện double-approval.
- **revalidateTags:** mỗi mutation phải gọi `revalidateTag()` với tag tương ứng module + companyId + tháng. Không dùng `revalidatePath` (quá broad).

---

## Requirements

### Employee module (/nhanvien)
- List: Server Component fetches from DB (filtered by companyId, excludes deletedAt)
- Search/filter: client-side filter state + server-side re-fetch or URL params
- Create employee: Server Action → creates Employee + User record + hashes password
- Edit employee: Server Action → updates Employee fields
- Soft delete (resign): Server Action → sets `deletedAt`, locks User account
- Role-based scoping: `employee` role sees only own record

### Attendance module (/chamcong)
- List WorkUnit records by month; Server Component with month param in URL
- Add attendance: Server Action → upserts WorkUnit (unique: employeeId + date)
- DeductionEvent list: separate tab; approve/reject: Server Action with AuditLog write
- `employee` role sees only own records

### Leave module (/nghiphep)
- LeaveRequest CRUD (separate from DeductionEvent — LeaveRequest is the formal leave form, DeductionEvent là payroll impact)
- Submit leave: Server Action → tạo LeaveRequest (status=PENDING)
- **Approve (1:N):** Server Action chạy trong `db.$transaction()` — cập nhật `LeaveRequest.status = APPROVED` + tạo batch DeductionEvents, một row mỗi ngày trong khoảng startDate→endDate (bỏ qua cuối tuần nếu SystemConfig yêu cầu). Mỗi DeductionEvent có `leaveRequestId` trỏ về LeaveRequest cha.
- Reject: cập nhật status = REJECTED, không tạo DeductionEvent. Nếu đã APPROVED trước đó, xóa batch DeductionEvents liên quan trong transaction.
- **Concurrency guard:** Dùng Prisma `updateMany` với `where: { id, status: "PENDING" }` — trả về `count=0` nếu record đã được duyệt bởi approver khác; throw lỗi "Đơn này đã được xử lý".

### Payroll module (/luong)
- Payroll list by month: Server Component
- Generate payroll for month: Server Action → runs calculation, creates/updates Payroll records
- **Approval workflow (single-level):** DRAFT → PENDING → APPROVED → PAID
  - `luong.edit` permission: chuyển DRAFT→PENDING
  - `luong.approve` permission: chuyển PENDING→APPROVED → APPROVED→PAID
  - Mỗi transition là một Server Action riêng, chạy trong `db.$transaction()` + ghi AuditLog
- **Concurrency guard cho approve:** `updateMany({ where: { id, status: "PENDING" } })` — nếu count=0 throw "Bảng lương đã được xử lý"
- Payroll calculation: `payroll.service.ts:calculatePayroll(employeeId, month)` — fetches WorkUnit, DeductionEvent (approved), SalaryColumn/Value, PITBracket, InsuranceRate từ DB
- **revalidateTags sau mỗi mutation:** `revalidateTag(\`payroll-${companyId}-${month}\`)` để dashboard và /luong page reload data mới

---

## Architecture

### Page pattern (Server Component shell + Client sub-components)

```
src/app/nhanvien/
  page.tsx              ← Server Component — fetches data, passes to client table
  actions.ts            ← Server Actions (createEmployee, updateEmployee, deleteEmployee)
  components/
    EmployeeTable.tsx   ← 'use client' — search state, modal triggers
    EmployeeModal.tsx   ← 'use client' — create/edit form, calls Server Actions

src/app/chamcong/
  page.tsx              ← Server Component — reads ?month= from searchParams
  actions.ts            ← Server Actions
  components/
    AttendanceTable.tsx
    AttendanceModal.tsx
    DeductionPanel.tsx

src/app/nghiphep/
  page.tsx
  actions.ts
  components/
    LeaveTable.tsx
    LeaveRequestModal.tsx
    LeaveApprovalActions.tsx

src/app/luong/
  page.tsx
  actions.ts
  components/
    PayrollTable.tsx
    PayrollApprovalBar.tsx
    PayrollCalculateButton.tsx
```

### Payroll calculation service

```typescript
// src/services/payroll.service.ts

export async function calculatePayroll(companyId: string, employeeId: string, month: Date) {
  const [employee, workUnits, deductions, salaryColumns, salaryValues, insuranceRates, pitBrackets] =
    await Promise.all([
      db.employee.findUnique({ where: { id: employeeId } }),
      db.workUnit.findMany({ where: { employeeId, date: { gte: startOfMonth(month), lte: endOfMonth(month) } } }),
      db.deductionEvent.findMany({ where: { employeeId, status: "APPROVED", date: { gte: startOfMonth(month), lte: endOfMonth(month) } } }),
      db.salaryColumn.findMany({ where: { companyId } }),
      db.salaryValue.findMany({ where: { employeeId, month: formatMonth(month) } }),
      db.insuranceRate.findFirst({ where: { companyId, validFrom: { lte: month }, OR: [{ validTo: null }, { validTo: { gte: month } }] } }),
      db.pITBracket.findMany({ where: { companyId, validFrom: { lte: month } }, orderBy: { minIncome: "asc" } }),
    ])

  const congSoNhan = workUnits.reduce((s, w) => s + Number(w.units), 0)
  const congSoTru = deductions.reduce((s, d) => s + Math.abs(Number(d.delta)), 0)
  const netWorkUnits = congSoNhan - congSoTru

  const baseSalary = Number(employee!.baseSalary)
  // Evaluate dynamic SalaryColumn formulas using evalFormula()
  const vars = buildVarsFromColumns(salaryColumns, salaryValues, { net_cong_so: netWorkUnits, luong_co_ban: baseSalary })
  const grossSalary = computeGross(vars, salaryColumns)

  const bhxh = Math.round(grossSalary * Number(insuranceRates!.employeeRate))
  const bhyt = Math.round(grossSalary * 0.015)
  const bhtn = Math.round(grossSalary * 0.01)
  const taxableIncome = grossSalary - bhxh - bhyt - bhtn - PERSONAL_DEDUCTION
  const pitTax = computePIT(taxableIncome, pitBrackets)
  const netSalary = grossSalary - bhxh - bhyt - bhtn - pitTax

  return db.payroll.upsert({
    where: { employeeId_month: { employeeId, month: startOfMonth(month) } },
    update: { congSoNhan, congSoTru, netWorkUnits, baseSalary, grossSalary, bhxhEmployee: bhxh, bhytEmployee: bhyt, bhtnEmployee: bhtn, pitTax, netSalary, status: "DRAFT" },
    create: { companyId, employeeId, month: startOfMonth(month), congSoNhan, congSoTru, netWorkUnits, baseSalary, grossSalary, bhxhEmployee: bhxh, bhytEmployee: bhyt, bhtnEmployee: bhtn, pitTax, netSalary, status: "DRAFT" },
  })
}
```

### Server Component data fetching pattern

```typescript
// src/app/nhanvien/page.tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { employeeService } from "@/services/employee.service"
import EmployeeTable from "./components/EmployeeTable"

export default async function NhanvienPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const isEmployee = session.user.role === "employee"
  const employees = isEmployee
    ? await employeeService.getById(session.user.companyId!, session.user.employeeId!)
    : await employeeService.list(session.user.companyId!)

  return <EmployeeTable initialData={employees} session={session} />
}
```

---

## Related Code Files

**Current files that will change:**
- `src/app/nhanvien/page.tsx` — convert from `'use client'` + `useAuth()` to Server Component
- `src/app/chamcong/page.tsx` — same conversion
- `src/app/nghiphep/page.tsx` — same conversion
- `src/app/luong/page.tsx` — same conversion
- `src/components/auth/AuthProvider.tsx` — remove data state (done in Phase 02)

**New files:**
- `src/app/nhanvien/actions.ts`
- `src/app/nhanvien/components/EmployeeTable.tsx`
- `src/app/nhanvien/components/EmployeeModal.tsx`
- `src/app/chamcong/actions.ts`
- `src/app/chamcong/components/AttendanceTable.tsx`
- `src/app/chamcong/components/DeductionPanel.tsx`
- `src/app/nghiphep/actions.ts`
- `src/app/nghiphep/components/LeaveTable.tsx`
- `src/app/nghiphep/components/LeaveRequestModal.tsx`
- `src/app/luong/actions.ts`
- `src/app/luong/components/PayrollTable.tsx`
- `src/app/luong/components/PayrollApprovalBar.tsx`
- `src/services/employee.service.ts` (full implementation)
- `src/services/attendance.service.ts`
- `src/services/leave.service.ts`
- `src/services/payroll.service.ts`
- `src/lib/schemas/employee.ts`
- `src/lib/schemas/attendance.ts`
- `src/lib/schemas/leave.ts`
- `src/lib/schemas/payroll.ts`
- `src/app/api/employees/route.ts` + `[id]/route.ts`
- `src/app/api/attendance/route.ts`
- `src/app/api/leave/route.ts` + `[id]/route.ts`
- `src/app/api/payroll/route.ts` + `[id]/route.ts`
- `src/app/api/export/payroll/route.ts`

---

## Implementation Steps

1. Implement `employeeService` fully (list, getById, create, update, softDelete)
2. Write `src/lib/schemas/employee.ts` Zod schema
3. Convert `src/app/nhanvien/page.tsx` to Server Component shell
4. Extract `EmployeeTable.tsx` and `EmployeeModal.tsx` as client components
5. Write `src/app/nhanvien/actions.ts` — createEmployee (creates Employee + User with hashed password), updateEmployee, resignEmployee (softDelete + lock User)
6. Wire EmployeeModal form to Server Actions; add `useTransition` for pending state
7. Repeat steps 1-6 for Attendance (chamcong) — WorkUnit CRUD + DeductionEvent approval
8. Implement `leaveService` — LeaveRequest CRUD + approval (creates DeductionEvent on approve)
9. Convert /nghiphep page + write actions
10. Implement `payrollService.calculatePayroll()` — full formula pipeline
11. Write `computePIT()` helper using PITBracket from DB
12. Write `generateMonthlyPayroll(companyId, month)` — calculates for all active employees
13. Convert /luong page to Server Component; add approve/paid Server Actions
14. Write `/api/export/payroll/route.ts` — generates CSV with `text/csv` response
15. Test payroll calculation against known values from current mock data

---

## Todo List

- [ ] Implement employeeService (list, getById, create, update, softDelete)
- [ ] Write employee Zod schema
- [ ] Convert /nhanvien to Server Component
- [ ] Extract EmployeeTable + EmployeeModal client components
- [ ] Write employee Server Actions
- [ ] Implement attendanceService (WorkUnit CRUD, DeductionEvent approval)
- [ ] Convert /chamcong to Server Component + client sub-components
- [ ] Write attendance Server Actions
- [ ] Implement leaveService (LeaveRequest CRUD + approve → batch DeductionEvent creation trong $transaction, 1:N)
- [ ] Implement concurrency guard trong approve/reject actions (updateMany + count check)
- [ ] Convert /nghiphep to Server Component + client sub-components
- [ ] Write leave Server Actions với revalidateTag
- [ ] Implement payrollService.calculatePayroll() with PIT + insurance
- [ ] Implement generateMonthlyPayroll() for bulk calculation
- [ ] Convert /luong to Server Component + client sub-components
- [ ] Write payroll Server Actions (calculate, toPending, approve, markPaid) — mỗi action trong $transaction + AuditLog
- [ ] Implement concurrency guard cho payroll approve
- [ ] Add revalidateTag cho payroll, attendance, leave sau mỗi mutation
- [ ] Write /api/export/payroll CSV route
- [ ] Validate payroll output against current mock data values
- [ ] AuditLog writes for all approval actions

---

## Success Criteria

- `/nhanvien` loads employee list from DB (not constants/data.ts)
- Creating employee persists to DB; page re-loads with new record
- Resigned employee disappears from list (soft delete) but payroll history preserved
- `/chamcong` filters by month via URL param `?month=2026-04`
- Leave approval (5-day leave) tạo đúng 5 DeductionEvents liên kết qua leaveRequestId
- Reject sau khi approve xóa toàn bộ DeductionEvents liên quan
- Double-approve bởi 2 approver trả error "Đã xử lý" cho người thứ hai
- Payroll calculation matches expected net salary for test employee with known inputs
- revalidateTag hoạt động: thay đổi lương → dashboard KPI cập nhật ngay sau reload
- CSV export downloads correctly formatted file
- AuditLog row created for every approve/reject action

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Payroll formula mismatch with current mock data | High | High | Validate against 2-3 known employee records from constants/data.ts before cutover |
| PIT bracket change (July 2026 reform) | Certain | Medium | PITBracket in DB — update rates without redeploy |
| LeaveRequest / DeductionEvent disconnect | Medium | Medium | Wrap approve action in db.$transaction() |
| Large employee list performance | Low | Low | Pagination via `take`/`skip` in service; add indexes |

---

## Security Considerations

- `employee` role: all service functions must scope to `employeeId === session.user.employeeId`
- Payroll generate action requires `luong.edit`; approve requires `luong.approve` — two separate permission guards
- Employee password (User.password) never returned in any list/get response — use Prisma `select` to explicitly exclude it
- AuditLog captures `changedBy: session.user.id` for all approval state transitions

---

## Next Steps

Phase 05 (Finance Modules) follows the identical pattern. Phase 06 (Admin) depends on payroll column config working correctly.
