# Project Overview & Product Development Requirements (PDR)

**Project:** ADMIN_HL17 — nhansu.hl17
**Version:** 2.0
**Last Updated:** 2026-04-13
**Status:** Production — Full-stack system with 13-phase payroll engine complete

---

## 1. Project Overview

ADMIN_HL17 (nhansu.hl17) is a Vietnamese HR management SaaS system designed for SMEs (small-to-medium enterprises). It provides a unified dashboard-driven interface for managing employees, payroll, attendance, leave, recruitment, and financial data.

The system is branded as "Quản trị nhân sự" (HR Administration). All UI is in Vietnamese, with the primary user context being Vietnamese SMEs operating in VND currency.

### 1.1 Business Context

The application manages two primary concern areas:

- **Nhân sự (Human Resources):** Employee records, attendance tracking (chấm công), payroll (lương & thưởng), leave requests (nghỉ phép), and recruitment pipeline (tuyển dụng).
- **Tài chính (Finance):** Revenue (doanh thu), expenses (chi phí), cashflow (dòng tiền), budget tracking (ngân sách), and debt/receivables management (công nợ).

### 1.2 System State

The system is fully operational with:
- PostgreSQL database via Prisma 7 ORM
- Auth.js v5 with JWT sessions and RBAC middleware
- Complete payroll engine (13 upgrade phases, formula engine, workflow, versioning, anomaly detection, Excel export)
- SWR-based client data fetching via Route Handlers
- Multi-tenant readiness (`companyId` on all tables)

### 1.3 Target Users

| Role | Vietnamese Label | Description |
|------|-----------------|-------------|
| `boss_admin` | Boss Admin | Full system access — wildcard `*` permissions |
| `admin` | Quản trị viên | All modules with HR and system edit rights |
| `hr_manager` | QL Nhân sự | Full HR management, `luong.view` + `luong.edit` only |
| `accountant` | Kế toán | `luong.approve`, `luong.export`; full finance management |
| `employee` | Nhân viên | Self-service: own attendance, payslip, leave only |

---

## 2. Functional Requirements

### FR-01: Authentication & Session Management

- Users authenticate via email + password
- Credentials verified against bcrypt-hashed passwords in PostgreSQL (`users` table) via Auth.js v5 Credentials provider
- Sessions stored as signed JWTs (strategy: `"jwt"`) with custom claims: `role`, `permissions`, `employeeId`, `companyId`
- Locked accounts (`accountStatus: LOCKED`) cannot log in — checked in `authorize()` callback
- Accounts without system access (`accountStatus: NO_ACCOUNT`) are excluded from login
- `ProtectedLayout` redirects unauthenticated users; `middleware.ts` enforces RBAC at Edge

### FR-02: Role-Based Access Control (RBAC)

- Permissions structured as `<module>.<action>` strings (e.g., `nhanvien.edit`, `luong.approve`)
- Five pre-defined permission groups (static fallback in `PERMISSION_GROUPS` in `constants/data.ts`)
- Custom groups stored in DB (`permission_groups` table) via the Phân quyền screen; DB groups take precedence over static fallback
- Individual users may have per-user `permissions` field in `users` table
- Route-level access enforced in `middleware.ts` (Edge-compatible) via `ROUTE_PERMISSION` map
- Session carries `role`, `permissions`, `employeeId`, `companyId` — injected via `jwt` + `session` callbacks

### FR-03: Dashboard

- Four KPI summary cards: doanh thu, chi phí, nhân viên, công nợ
- Revenue and expense 6-month bar chart (Recharts)
- Cashflow list panel
- Employee status table for the current day
- Budget breakdown by category
- Cost structure donut chart
- **Manager overview** (`GET /api/dashboard/manager-overview`): today's pulse (working/absent/unpaid-leave counts), action queue (missing attendance, DRAFT payrolls, pending leaves), month progress bar. `missingAttendanceCount` excludes employees whose current-month payroll is not DRAFT — chamcong-guard blocks mutations for those, so missing rows are not actionable.
- **Manager team table** (`GET /api/dashboard/manager-team`): one row per active employee with today's status, monthly công total, KPI violation count, and payroll status. Rows ordered by `Employee.createdAt asc` to match the `/api/payroll` table order. KPI violation count sums `types[].length` across all `KpiViolation` rows for the month (not the row count), matching the source-of-truth `attendance-kpi` endpoint. `monthWorkUnits` displayed without rounding (e.g., `11.5` not `12`).

### FR-04: Employee Management (Nhân viên)

- Full employee roster with search, department filter, and status filter
- Employee fields: identity, contact, department, role, contract type, salary, banking, tax, social insurance, account credentials
- Status values (enum): `WORKING`, `HALF`, `LEAVE`, `REMOTE`, `RESIGNED`
- Contract types (enum): `FULL_TIME`, `PART_TIME`, `INTERN`, `FREELANCE`
- Soft delete (`deletedAt`) — resigned employees preserved for payroll audit trail
- CRUD via Route Handlers at `/api/employees`
- `employee` role sees only own record (enforced server-side in Route Handler via session `employeeId`)
- **Employee self-edit**: `PATCH /api/employees/[id]` has an implicit self-edit branch — if `ctx.role === "employee" && ctx.employeeId === id`, the `nhanvien.edit` permission check is bypassed and the payload is silently filtered to `SELF_EDITABLE_FIELDS`: `fullName`, `phone`, `gender`, `address`, `bankName`, `bankAccount`. System fields (`email`, `dob`, `idCard`, `taxCode`, `bhxhCode`, `baseSalary`, `department`, `position`, `contractType`, `status`, `accountStatus`) remain admin-only. No new permission was added.
- **Column picker (manager/admin view)**: 15 configurable columns (7 ON by default), persisted to `localStorage` under `nhansu.list-visible-cols`. "Họ tên" is required and cannot be toggled off.
- **Field picker (employee self-profile)**: visible fields persisted to `localStorage` under `nhansu.self-visible-fields`. Both pickers hydrate from localStorage after mount (SSR-safe).

### FR-05: Attendance Tracking (Chấm công)

- `WorkUnit` records (công số nhận) per employee per day — unique constraint on `(employeeId, date)`
- `OvertimeEntry` records for overtime hours per employee per day
- `KpiViolation` records for KPI deductions per day (multi-type `String[]` — one row can hold multiple violation codes for the same day)
- `DeductionEvent` records for manual deductions (DI_MUON, VE_SOM, NGHI_NGAY, OVERTIME)
- Month-based view with URL param `?month=YYYY-MM`
- **All three WorkUnit mutation paths trigger payroll recalc** (fire-and-forget, `.catch(console.warn)`):
  - POST (cell upsert): calls `autoRecalcDraftPayroll(companyId, employeeId, dateObj)`
  - DELETE bulk wipe (`DELETE /api/work-units?employeeId=&month=`): calls `autoRecalcDraftPayroll(companyId, employeeId, monthStart)`
  - Auto-fill createMany (`POST /api/work-units/auto-fill`): calls `recalculateMonth(companyId, monthStart)`
- `chamcong-guard` blocks mutations on payrolls that are not DRAFT (PENDING/APPROVED/LOCKED/PAID); this closes the loop — any day that cannot be mutated is excluded from the manager action queue
- Auto-fill accepts an optional `{ month: "YYYY-MM" }` body; defaults to current Vietnam-time month; rejects future months

### FR-06: Payroll (Lương & thưởng)

The payroll system has been through 13 upgrade phases. Current capabilities:

**Calculation engine:**
- Backend-authoritative: all math runs in `calculatePayroll()` on the server
- Formula columns (`SalaryColumn`) stored in DB, evaluated via `evalFormula()` from `expr-eval`
- Topological sort ensures formula evaluation order respects inter-column dependencies
- Circular dependency detection at save time (blocks saving circular formulas)
- Formula versioning: `SalaryColumnVersion` records formula changes with `effectiveFrom` date; historical recalculation uses the formula active at that month
- `FormulaError` contract: bad formulas cascade-fail gracefully, function never throws
- Insurance rates (BHXH 8%, BHYT 1.5%, BHTN 1%) loaded from `InsuranceRate` DB table with time-validity
- PIT tax computed via progressive brackets from `PITBracket` DB table; fallback hardcoded 7-bracket structure
- Personal deduction: 11,000,000 VND/month (hardcoded — update when PIT reform takes effect)

**Salary components computed:**
- `congSoNhan` — sum of WorkUnit.units for the month
- `congSoTru` — sum of APPROVED DeductionEvent.delta for the month
- `netWorkUnits` = max(0, congSoNhan + congSoTru)
- `workSalary` = `baseSalary * netWorkUnits / 26` (or formula override via `tong_luong_co_ban` column)
- `overtimePay` = `baseSalary / 26 / 8 * overtimeHours * 1.5` (or formula override via `tien_tang_ca`)
- `mealPay` = `netWorkUnits * 35,000` (or formula override via `tien_an`)
- `responsibilitySalary` — from employee record
- `tienPhuCap`, `thuong`, `tienPhat` (= `tienTruKhac`), `kpiChuyenCan` — from `SalaryValue` manual inputs (canonical `SalaryColumn` keys: `tien_phu_cap`, `thuong`, `tien_tru_khac`, `kpi_chuyen_can`)
- `grossSalary` = workSalary + overtimePay + responsibilitySalary + mealPay + tienPhuCap + thuong + kpiChuyenCan - tienPhat
  - `kpiChuyenCan` is a bonus (positive, adds to gross)
  - `tienPhat` is a deduction (displayed as "Trừ khác" in payslip)
- `bhxhEmployee`, `bhytEmployee`, `bhtnEmployee` — on `baseSalary`
- `pitTax` — progressive brackets on (gross - insurance - personalDeduction)
- `netSalary` — if any `SalaryColumn` has `calcMode` configured: sum of `add_to_net` columns minus `subtract_from_net` columns; otherwise `max(0, gross - insurance - pit)`

**Payroll data model — 3 tiers:**
1. `salary_columns` — per-company column template (key, name, formula, calcMode, order)
2. `salary_values` — sparse per-employee × month manual inputs; `columnKey` FK references `salary_columns(companyId, key)` with `ON DELETE RESTRICT ON UPDATE CASCADE`
3. `payrolls` — computed output per employee × month; contains only computed scalar fields (dropped: `kpiBonus`, `bonus`, `kpiTrachNhiem`, `otherDeductions`)

**Workflow (PayrollStatus enum):**
```
DRAFT → PENDING → APPROVED → LOCKED → PAID
```
- Concurrency guard: `updateMany` + `count === 0` check prevents double-approval race conditions
- `AuditLog` written for every status transition
- At LOCKED status: immutable `Payroll.snapshot` JSON captures full calc state (vars, formula results, insurance rates, PIT brackets)
- `needsRecalc` flag: set `true` on attendance mutations; cleared after recalculation; never recalculates non-DRAFT rows

**Anomaly detection (Phase 09):**
- Error-level: negative net salary, attendance > 31 days, PIT > gross salary
- Warning-level: gross = 0 with attendance > 0, month-over-month change > 30%
- Error anomalies block DRAFT → PENDING transition

**Exports:**
- Excel export via ExcelJS at `GET /api/export/payroll?month=YYYY-MM`
- Requires `luong.export` permission (or `admin`/`boss_admin` role)

**RBAC on payroll:**
- `hr_manager`: `luong.view`, `luong.edit` — can create/recalculate DRAFT, cannot approve
- `accountant`: `luong.view`, `luong.approve`, `luong.export` — can approve and export
- `admin`/`boss_admin`: full `luong.*`
- `employee`: sees own payslip only — enforced server-side via `sessionEmployeeId`

### FR-07: Leave Management (Nghỉ phép)

- Leave request types (enum `LeaveType`): ANNUAL, SICK, PERSONAL, MATERNITY, UNPAID, WEDDING, BEREAVEMENT
- Status flow (`ApprovalStatus`): `PENDING` → `APPROVED` / `REJECTED` / `CANCELLED`
- Approval creates batch `DeductionEvent` records (1 per calendar day) in `db.$transaction()` with `leaveRequestId` FK
- Rejection removes existing `DeductionEvent` records in same transaction
- Concurrency guard: `updateMany` + `count === 0` prevents double-approval
- CRUD via Route Handlers at `/api/leave-requests` and `/api/leave-requests/[id]`

### FR-08: Recruitment (Tuyển dụng)

- Job openings with applicant pipeline tracking
- Seniority levels: intern, junior, mid, senior, lead, manager
- Pipeline status: open, interviewing, closed, cancelled

### FR-09: Revenue Management (Doanh thu)

- Revenue records by date, customer, category, payment method
- Categories (`RevenueCategory` enum): PRODUCT, SERVICE, CONSULTING, INVESTMENT, OTHER
- Invoice number and status tracking

### FR-10: Expense Management (Chi phí)

- Expense records with department allocation
- Categories (`ExpenseCategory` enum): SALARY, RENT, UTILITIES, MARKETING, EQUIPMENT, TRAVEL, INSURANCE, TAX, OTHER
- Approval status: PENDING / APPROVED / REJECTED

### FR-11: Cashflow (Dòng tiền)

- Derived view — merges `RevenueRecord` + `ExpenseRecord`, sorted by date
- Running balance computed in service/display layer (cumulative sum)
- No separate `CashflowItem` table

### FR-12: Budget Management (Ngân sách)

- Budget records per category and department per period
- `actual` column computed on read (not stored) — avoids sync bugs

### FR-13: Debt Management (Công nợ)

- Receivables (`RECEIVABLE`) and payables (`PAYABLE`) via `DebtType` enum
- Overdue day tracking and bad debt flagging
- `isPaidOff` boolean flag; `paid` amount tracked separately from `amount`

### FR-14: Settings (Cài đặt)

- Company profile: name, tax ID, address, contact, banking, director
- `PITBracket` records: editable via Settings UI, time-validity (`validFrom`, `validTo`)
- `InsuranceRate` records: editable per type (BHXH, BHYT, BHTN) with time-validity
- `SalaryColumn` CRUD: formula columns with preview validation before save
- `SalaryColumnVersion` management: formula changes create versioned snapshots

### FR-15: Permissions Administration (Phân quyền)

- Permission group matrix: module × action (view, edit, delete, approve, export, config)
- Add/edit custom permission groups (stored in `permission_groups` table)
- System groups (`isSystem: true`) cannot be deleted via UI
- Permission changes take effect on next login (JWT-based — no server-side revocation)
- Account status management: ACTIVE / LOCKED / NO_ACCOUNT

### FR-16: Password Change (Đổi mật khẩu)

- Authenticated user changes own password via `/doi-mat-khau`
- Current password verified against bcrypt hash before update

---

## 3. Non-Functional Requirements

### NFR-01: Localization

- All UI labels, validation messages, and status strings are in Vietnamese
- Currency formatting via `fmtVND()` and `fmtMoney()` from `@/lib/format`
- Date formatting via `fmtDate()` — `dd/MM/yyyy` convention
- `lang="vi"` on the HTML element

### NFR-02: Performance

- SWR client-side caching with automatic revalidation on mutation
- Prisma query optimization: `select` to avoid over-fetching, indexed `companyId` + `date` on all time-series tables
- `companyId` index on all tables for multi-tenant scoping
- `@prisma/adapter-pg` for direct PostgreSQL connection (no Prisma connection pool overhead)

### NFR-03: Persistence

- All data persisted in PostgreSQL via Prisma 7 ORM
- `Decimal @db.Decimal(15,0)` for all VND amounts — no Float, no overflow risk above 999 trillion VND
- Soft delete (`deletedAt`) on `Employee` — resigned employees never hard-deleted
- `companyId` on every table for multi-tenancy readiness
- `@unique([companyId, email])` on Employee, `@unique([companyId, name])` on PermissionGroup
- `@unique([employeeId, date])` on WorkUnit — one record per employee per day

### NFR-04: Security

- Passwords hashed with bcryptjs (cost factor 12)
- JWT sessions via Auth.js v5 — `HttpOnly`, `Secure`, `SameSite=Lax` cookies
- Route RBAC enforced in `middleware.ts` at Edge — no client-side bypass
- Session `companyId` is the tenant boundary — all Route Handler queries scope to it
- `NEXTAUTH_SECRET` minimum 32 bytes, never committed
- Employee self-scoping enforced server-side in Route Handlers (not relying on client filters)

### NFR-05: Testing

- 24 Vitest unit tests for formula engine (`src/lib/__tests__/formula.test.ts`)
- Tests cover: `evalFormula`, `extractVars`, `buildDependencyGraph`, `topologicalSort`, `detectCircular`, `validateFormula`, `CircularDependencyError`
- Run with `npm run test` (or `npm run test:coverage` for coverage report)

---

## 4. Out of Scope (v1.0)

- Email notifications
- Multi-tenancy UI (companyId columns are ready; UI is single-tenant)
- Mobile application
- File uploads (employee photos, receipt images)
- Real-time websocket updates
- OAuth / social login (Credentials provider only)
- Finance module backend API (doanhthu, chiphi, dongtien, ngansach, congno use static/local data)

---

## 5. Acceptance Criteria

| Feature | Criterion |
|---------|-----------|
| Login | Correct credentials set JWT session cookie; incorrect returns Vietnamese error; locked accounts blocked |
| RBAC | `middleware.ts` blocks unauthorized routes at Edge; session-scoped permissions enforced in Route Handlers |
| Payroll calculation | Net salary formula: gross - insurance(on baseSalary) - PIT(progressive brackets) = net |
| Formula engine | Topological sort evaluates dependent columns in correct order; circular deps detected at save time |
| Payroll workflow | Only DRAFT can be recalculated; LOCKED payrolls have immutable `snapshot` JSON |
| Concurrency guard | Double-approve attempt: second call returns error because `updateMany count === 0` |
| Anomaly detection | Negative net salary blocks PENDING transition; large month-over-month change triggers warning |
| Excel export | `GET /api/export/payroll?month=YYYY-MM` returns `.xlsx` file with all payroll rows |
| Formula versioning | Changing a column formula creates a `SalaryColumnVersion`; recalculating April uses April's formula |
| Employee self-scoping | `employee` role Route Handler returns only own payroll; `employeeId` from JWT, not query param |
| Employee self-edit | `PATCH /api/employees/[id]` by own employee strips non-whitelisted fields before validation; admin-only fields cannot be changed by self |
| SalaryValue FK | Deleting a `SalaryColumn` that has `SalaryValue` rows returns a DB error; renaming the key cascades to all `salary_values` rows automatically |
| Chamcong recalc | After bulk WorkUnit delete or auto-fill, DRAFT payrolls for that month reflect the new attendance totals |
| Leave approval | N-day leave creates N DeductionEvents atomically in `db.$transaction()` |
| Settings | PITBracket and InsuranceRate editable via Settings UI without redeploy |

---

## 6. Data Model Summary

### Core Tables

| Model | Table | Key Purpose |
|-------|-------|------------|
| `User` | `users` | Auth — email, bcrypt password, role, permissions, companyId |
| `Account` / `Session` / `VerificationToken` | standard | Auth.js v5 adapter tables |
| `Company` | `companies` | Company profile and settings |
| `CompanySettings` | `company_settings` | Work hours, overtime rates, leave policy |
| `Employee` | `employees` | HR records with soft delete (`deletedAt`) |
| `WorkUnit` | `work_units` | Daily attendance units per employee |
| `OvertimeEntry` | `overtime_entries` | Daily overtime hours per employee |
| `KpiViolation` | `kpi_violations` | KPI deduction records |
| `DeductionEvent` | `deduction_events` | Attendance deductions (manual + leave-driven) |
| `LeaveRequest` | `leave_requests` | Leave requests with 1:N `DeductionEvent` |
| `Payroll` | `payrolls` | Monthly computed payroll record with workflow status; scalar shadow fields removed (dropped: `kpiBonus`, `bonus`, `kpiTrachNhiem`, `otherDeductions`) |
| `SalaryColumn` | `salary_columns` | Per-company dynamic formula column definitions (key, name, formula, calcMode) |
| `SalaryColumnVersion` | `salary_column_versions` | Formula history with `effectiveFrom` date |
| `SalaryValue` | `salary_values` | Sparse manual input values per employee × month; `columnKey` has FK to `salary_columns(companyId, key)` — `ON DELETE RESTRICT ON UPDATE CASCADE` |
| `PITBracket` | `pit_brackets` | Progressive tax brackets with time-validity |
| `InsuranceRate` | `insurance_rates` | BHXH/BHYT/BHTN rates with time-validity |
| `PermissionGroup` | `permission_groups` | RBAC groups (system + custom) |
| `AuditLog` | `audit_logs` | All approval transitions with `oldData`/`newData` snapshots |
| `RevenueRecord` | `revenue_records` | Revenue entries |
| `ExpenseRecord` | `expense_records` | Expense entries with approval status |
| `BudgetRecord` | `budget_records` | Budget targets (actual computed on read) |
| `DebtRecord` | `debt_records` | Receivables and payables |

### Key Enums

`ContractType`, `AccountStatus`, `PayrollStatus` (DRAFT/PENDING/APPROVED/LOCKED/PAID), `ApprovalStatus`, `DeductionType`, `InsuranceType`, `RevenueCategory`, `ExpenseCategory`, `DebtType`, `LeaveType`, `EmployeeStatus`
