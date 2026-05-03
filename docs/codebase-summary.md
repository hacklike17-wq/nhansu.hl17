# Codebase Summary

**Project:** ADMIN_HL17 — nhansu.hl17
**Last Updated:** 2026-05-02
**Framework:** Next.js 16.2.3 (App Router, Turbopack) with React 19, TypeScript 5, Prisma 7

---

## Directory Structure

```
nhansu.hl17/
├── prisma/
│   ├── schema.prisma               # Single-file schema (Prisma 7, PostgreSQL)
│   ├── migrations/                 # Migration history
│   ├── seed.ts                     # Seed entry point
│   └── seed-salary-columns.ts      # Salary column seed data
├── plans/
│   ├── 260412-modules-redesign/    # Superseded — skipped
│   ├── 260412-payroll-upgrade/     # Active — 13 phases (all complete)
│   │   ├── plan.md
│   │   ├── phase-01-formula-engine.md
│   │   ├── phase-01b-formula-safety.md
│   │   ├── phase-02-salary-config-ui.md
│   │   ├── phase-03-data-sync.md
│   │   ├── phase-03b-recompute-strategy.md
│   │   ├── phase-04-attendance-payroll-crud.md
│   │   ├── phase-05-manual-inputs.md
│   │   ├── phase-06-system-standardization.md
│   │   ├── phase-07-workflow-audit.md
│   │   ├── phase-07b-payroll-snapshot.md
│   │   ├── phase-08-versioning-testing.md
│   │   ├── phase-09-optimization-export.md
│   │   └── phase-10-saas-expansion.md
│   └── 260412-production-migration/ # Completed — system is now full-stack
├── src/
│   ├── auth.config.ts              # Edge-safe Auth.js config (JWT strategy, RBAC)
│   ├── auth.ts                     # Full Auth.js config (PrismaAdapter + Credentials)
│   ├── middleware.ts               # Auth + RBAC enforcement (Edge runtime)
│   ├── generated/prisma/           # Prisma generated client (auto — do not edit)
│   ├── app/
│   │   ├── layout.tsx              # Server Component — ThemeProvider + AuthProvider
│   │   ├── globals.css             # Tailwind v4 + shadcn tokens
│   │   ├── page.tsx                # Dashboard
│   │   ├── login/page.tsx          # Login form — calls signIn()
│   │   ├── nhanvien/page.tsx       # Employee management (client, SWR)
│   │   ├── chamcong/page.tsx       # Attendance management (client, SWR)
│   │   ├── luong/page.tsx          # Payroll management (client, SWR)
│   │   ├── nghiphep/page.tsx       # Leave requests (client, SWR)
│   │   ├── tuyendung/page.tsx      # Recruitment
│   │   ├── phanquyen/page.tsx      # Permission groups
│   │   ├── caidat/page.tsx         # Settings: PITBracket, InsuranceRate, SalaryColumn, AI config, Cấu hình bảng công
│   │   │   └── _components/
│   │   │       ├── AiConfigTab.tsx           # Admin-only AI config tab: key input, model selector, prompts, cost progress bar
│   │   │       └── AttendanceConfigTab.tsx   # Admin-only attendance config tab: cron toggle + hour, Google Sheet sync toggle + hour + URL + month
│   │   ├── doi-mat-khau/page.tsx   # Password change
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts   # Auth.js GET/POST handler
│   │       ├── employees/
│   │       │   ├── route.ts        # GET (list), POST (create)
│   │       │   └── [id]/route.ts   # GET, PATCH, DELETE (soft)
│   │       ├── work-units/
│   │       │   ├── route.ts        # GET (list by month), POST (cell upsert + autoRecalc), DELETE (bulk wipe + autoRecalc)
│   │       │   ├── [id]/route.ts   # PATCH, DELETE
│   │       │   └── auto-fill/route.ts  # POST — bulk auto-fill + recalculateMonth
│   │       ├── overtime/
│   │       │   ├── route.ts        # GET, POST
│   │       │   └── [id]/route.ts   # PATCH, DELETE
│   │       ├── kpi-violations/
│   │       │   ├── route.ts        # GET, POST
│   │       │   └── [id]/route.ts   # PATCH, DELETE
│   │       ├── deductions/
│   │       │   ├── route.ts        # GET, POST
│   │       │   └── [id]/route.ts   # PATCH (approve/reject), DELETE
│   │       ├── leave-requests/
│   │       │   ├── route.ts        # GET, POST
│   │       │   └── [id]/route.ts   # PATCH (approve/reject/cancel)
│   │       ├── payroll/
│   │       │   ├── route.ts        # GET (list), POST (generate/generate-missing)
│   │       │   ├── [id]/route.ts   # PATCH (status transition), DELETE (DRAFT only)
│   │       │   ├── recalculate/route.ts   # POST — recalculate all DRAFT for month
│   │       │   └── salary-values/route.ts # GET, POST — manual input values
│   │       ├── salary-columns/
│   │       │   ├── route.ts        # GET, POST
│   │       │   └── [id]/route.ts   # PATCH, DELETE
│   │       ├── permission-groups/
│   │       │   ├── route.ts        # GET, POST
│   │       │   └── [id]/route.ts   # PATCH, DELETE
│   │       ├── ai/
│   │       │   ├── chat/
│   │       │   │   ├── route.ts                     # POST — chat endpoint; assembles prompt, calls openaiChatWithTools(), logs usage
│   │       │   │   └── conversations/
│   │       │   │       ├── route.ts                 # GET — 50 most recent conversations + messageCount
│   │       │   │       └── [id]/route.ts             # GET full messages, DELETE (cascade)
│   │       │   ├── config/route.ts                  # GET (strips key), PATCH — AiConfig upsert (admin)
│   │       │   ├── test/route.ts                    # POST — test stored config in one click (admin)
│   │       │   └── usage/route.ts                   # GET — monthly token/cost summary + byUser (admin)
│   │       ├── settings/
│   │       │   └── attendance/route.ts        # GET — current attendance settings + lastSync; PATCH — update (validates URL + hour)
│   │       ├── sync/
│   │       │   ├── google-sheet/route.ts      # POST — manual "Đồng bộ ngay"; advisory-locked per company (admin only)
│   │       │   └── check-sheet/route.ts       # POST — "Kiểm tra sheet"; finds text-cells that look like numbers (admin only)
│   │       ├── cron/
│   │       │   ├── auto-fill-attendance/route.ts  # POST — Bearer CRON_SECRET; fires hourly, self-filters by autoFillCronHour; skips Sunday
│   │       │   └── sync-sheet/route.ts        # POST — Bearer CRON_SECRET; fires hourly, self-filters by sheetSyncCronHour; 7 days/week
│   │       ├── sheet-sync-logs/route.ts       # GET — list recent SheetSyncLog rows (?limit=10)
│   │       ├── dashboard/
│   │       │   ├── manager-overview/route.ts  # GET — today's pulse + action queue + month progress
│   │       │   └── manager-team/route.ts      # GET — per-employee status, công, KPI, payroll status
│   │       └── export/
│   │           └── payroll/route.ts # GET — Excel export (ExcelJS)
│   ├── components/
│   │   ├── ai/
│   │   │   └── ChatWidget.tsx      # Floating chat widget (460×600, bottom-right); history overlay; mounted in ProtectedLayout
│   │   ├── auth/
│   │   │   ├── AuthProvider.tsx    # SessionProvider + context bridge (useAuth hook)
│   │   │   └── ProtectedLayout.tsx # Layout shell + redirect for unauthenticated; mounts ChatWidget
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx         # Permission-filtered navigation
│   │   │   ├── Topbar.tsx          # Header bar
│   │   │   ├── PageShell.tsx       # Page wrapper with title
│   │   │   └── ThemeProvider.tsx   # next-themes (forcedTheme="light")
│   │   └── ui/                     # shadcn/ui primitives (do not hand-edit)
│   ├── constants/
│   │   └── data.ts                 # PERMISSION_GROUPS, ROUTE_PERMISSION, hasPermission(),
│   │                               #   resolvePermissions(), NAV_SECTIONS, DEFAULT_SALARY_COLUMNS,
│   │                               #   EMPLOYEES (static seed), DEPARTMENTS, DEFAULT_WORK_UNITS, etc.
│   ├── hooks/                      # SWR data hooks (client-side)
│   │   ├── usePayroll.ts           # usePayroll() + generatePayroll(), updatePayrollStatus()
│   │   ├── useEmployees.ts         # useEmployees()
│   │   ├── useWorkUnits.ts         # useWorkUnits()
│   │   ├── useOvertimeEntries.ts   # useOvertimeEntries()
│   │   ├── useKpiViolations.ts     # useKpiViolations()
│   │   ├── useDeductions.ts        # useDeductions()
│   │   └── useLeaveRequests.ts     # useLeaveRequests()
│   ├── lib/
│   │   ├── google-sheet-fetcher.ts # Fetch + validate + parse 3 tabs from xlsx export of Google Sheet
│   │   ├── data-import.ts          # WORK_UNIT_CODE_MAP — maps letter codes (ĐM, VS, NP, KL, KL2, LT, TS, QCC) to công values; planWorkUnitsImport/planOvertimeImport/planKpiImport with greedy KPI parser
│   │   ├── employee-filters.ts     # PAYROLL_INCLUDED_WHERE + isPayrollExcluded() — single source of truth for excludeFromPayroll filter across all 17 entry points
│   │   ├── services/
│   │   │   ├── sheet-sync.service.ts   # Core Google Sheet sync logic with advisory-lock per company
│   │   │   └── sheet-check.service.ts  # Sheet QA scan — finds text-cells that look like numbers
│   │   ├── ai/
│   │   │   ├── crypto.ts           # AES-256-GCM encrypt/decrypt for stored API keys; requires AI_ENCRYPTION_KEY env var
│   │   │   ├── providers/
│   │   │   │   ├── models.ts       # OPENAI_MODELS constant — client-safe (no server imports)
│   │   │   │   ├── openai.ts       # openaiChatWithTools() — max-5-iteration tool loop; server-only
│   │   │   │   └── pricing.ts      # USD-per-1M-token table + estimateCostUSD() — client-safe
│   │   │   └── tools/
│   │   │       ├── types.ts        # ToolContext, ToolResult, Tool interfaces
│   │   │       ├── admin-tools.ts  # ADMIN_TOOLS: 5 company-wide query tools
│   │   │       ├── self-tools.ts   # SELF_TOOLS: 5 self-scope tools for manager/employee
│   │   │       └── index.ts        # getToolsForRole(role), toolToOpenAISchema()
│   │   ├── db.ts                   # Prisma singleton (PrismaPg adapter)
│   │   ├── formula.ts              # Formula engine (evalFormula, topologicalSort, detectCircular)
│   │   ├── format.ts               # fmtVND(), fmtMoney(), fmtDate()
│   │   ├── utils.ts                # cn() class merging
│   │   ├── schemas/                # Zod validation schemas
│   │   │   ├── auth.ts             # LoginSchema
│   │   │   ├── employee.ts         # CreateEmployeeSchema, UpdateEmployeeSchema
│   │   │   ├── attendance.ts       # WorkUnit, OvertimeEntry, KpiViolation schemas
│   │   │   └── payroll.ts          # GeneratePayrollSchema
│   │   ├── services/
│   │   │   └── payroll.service.ts  # calculatePayroll(), upsertPayroll(), autoRecalcDraftPayroll(),
│   │   │                           #   recalculateMonth(), buildPayrollSnapshot(), checkPayrollAnomalies(),
│   │   │                           #   markDraftPayrollsStale(), listForEmployee()
│   │   └── __tests__/
│   │       └── formula.test.ts     # 24 Vitest unit tests for formula engine
│   └── types/
│       ├── index.ts                # TypeScript domain types (Employee, SalaryRecord, etc.)
│       └── next-auth.d.ts          # Session type augmentation (role, permissions, employeeId, companyId)
├── .claude/                        # Claude Code configuration
│   ├── agents/                     # Agent definitions
│   ├── commands/                   # Custom slash commands
│   └── workflows/                  # Workflow definitions
├── docs/                           # Documentation (this directory)
├── public/                         # Static assets
├── scripts/
│   ├── sync-codes-with-sheet.ts             # Idempotent Employee.code sync — uses email as anchor, runs in transaction
│   ├── check-sheet-text-cells.ts            # CLI wrapper for sheet QA scan (calls sheet-check.service)
│   ├── cleanup-excluded-employee-data.ts    # One-off cleanup: delete WorkUnit/Payroll/etc for excludeFromPayroll employees. Default dry-run; pass --commit to delete.
│   ├── recalc-all-payrolls.ts               # Bulk recalculate all DRAFT payrolls (admin utility)
│   ├── snapshot-payroll.ts                  # Build + store snapshot for a specific payroll row
│   └── wipe-monthly-data.ts                 # Wipe all attendance data for a given month (dev utility)
├── next.config.ts                  # Next.js config (minimal)
├── prisma.config.ts                # Prisma config
├── tsconfig.json                   # TypeScript config (strict, @/* alias)
├── vitest.config.ts                # Vitest config
├── components.json                 # shadcn/ui config
├── eslint.config.mjs               # ESLint 9 flat config
└── postcss.config.mjs              # @tailwindcss/postcss
```

---

## Key Files and Their Purposes

### `prisma/schema.prisma`

Single-file Prisma 7 schema for PostgreSQL. Generator output at `../src/generated/prisma`. Key decisions:
- `Decimal @db.Decimal(15,0)` for all VND amounts
- `deletedAt DateTime?` on `Employee` for soft delete
- `@@unique([employeeId, date])` on `WorkUnit` — one attendance record per employee per day
- `@@unique([employeeId, month])` on `Payroll` — one payroll row per employee per month
- `snapshot Json?` on `Payroll` — immutable calc snapshot captured at LOCK time
- `anomalies Json?` on `Payroll` — array of `{rule, severity, message}` from anomaly detection
- `needsRecalc Boolean @default(false)` on `Payroll` — set `true` when inputs change

### `src/lib/db.ts`

Prisma client singleton using `PrismaPg` adapter (from `@prisma/adapter-pg`) for direct PostgreSQL connection:

```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" })
export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter })
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
```

Note: The `PrismaPg` adapter is used instead of the default Prisma connection; this bypasses Prisma's internal connection pool in favor of the `pg` pool.

### `src/auth.config.ts`

Edge-safe Auth.js v5 config — no DB import. Uses JWT session strategy (not DB sessions). Contains:
- `pages: { signIn: "/login" }`
- `session: { strategy: "jwt" }`
- `callbacks.authorized`: route guard — checks logged-in state + RBAC via `ROUTE_PERMISSION` + `hasPermission()`
- `callbacks.jwt`: injects `id`, `role`, `permissions`, `employeeId`, `companyId` into token on login
- `callbacks.session`: copies token fields to session object for client use

### `src/auth.ts`

Full Auth.js v5 config (Node.js only):
- Extends `authConfig` with `PrismaAdapter(db)` (for auth tables only — `Account`, `Session`, etc.)
- `Credentials` provider with `authorize()`:
  1. Zod-validates credentials via `LoginSchema`
  2. DB lookup of `User` by email
  3. Employee `accountStatus` check (LOCKED/NO_ACCOUNT blocks login)
  4. `bcrypt.compare()` for password verification
  5. Permission resolution: DB `PermissionGroup` → static `PERMISSION_GROUPS` fallback → `User.permissions` field
  6. Returns user object with custom fields for JWT injection

### `src/middleware.ts`

Thin Edge wrapper — imports `authConfig` only, no Prisma:
```typescript
export default NextAuth(authConfig).auth
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"]
}
```

### `src/constants/data.ts`

Central configuration module. Contains both UI config and static seed data:
- `ALL_MODULES`, `ALL_ACTIONS` — permission matrix UI
- `PERMISSION_GROUPS` — five static role definitions (static fallback; DB groups take precedence)
- `ROUTE_PERMISSION` — middleware + ProtectedLayout route-to-permission map
- `hasPermission(permissions, required)` — pure utility (Edge-safe)
- `resolvePermissions(role, overrides)` — using static groups
- `resolvePermissionsFromGroups(groups, role, overrides)` — using dynamic groups
- `NAV_SECTIONS` — sidebar navigation config
- `DEFAULT_SALARY_COLUMNS` — default salary column definitions
- `EMPLOYEES`, `DEFAULT_WORK_UNITS`, and other static seed data arrays (still present for fallback/display)

### `src/lib/formula.ts`

Formula engine using `expr-eval` (safe, sandboxed, no `eval()`/`new Function()`):

| Export | Purpose |
|--------|---------|
| `evalFormula(formula, vars)` | Evaluate formula string with vars; returns `number \| null` |
| `extractVars(formula)` | Extract referenced variable names |
| `buildDependencyGraph(columns)` | Build adjacency graph of inter-column dependencies |
| `topologicalSort(graph)` | Return evaluation order; throws `CircularDependencyError` on cycle |
| `detectCircular(graph)` | Return all cycles as paths (for UI validation) |
| `validateFormula(formula, knownVars, sampleVars)` | Syntax + unknown-var check + preview |
| `CircularDependencyError` | Error class for circular dependency detection |

### `src/lib/services/payroll.service.ts`

Core business logic. All payroll Route Handlers call these functions:

| Export | Purpose |
|--------|---------|
| `calculatePayroll(companyId, employeeId, monthDate)` | Full payroll calculation — returns `PayrollCalcResult` |
| `upsertPayroll(companyId, employeeId, monthStr)` | Create or update DRAFT payroll row |
| `autoRecalcDraftPayroll(companyId, employeeId, dateInMonth)` | Triggered by WorkUnit POST and DELETE; fire-and-forget |
| `recalculateMonth(companyId, month)` | Recalculate all DRAFT payrolls for a month; triggered by auto-fill; fire-and-forget |
| `markDraftPayrollsStale(companyId, month?)` | Set `needsRecalc=true` on DRAFT payrolls |
| `buildPayrollSnapshot(companyId, employeeId, monthDate, lockedBy, payrollRow)` | Build immutable JSON snapshot at LOCK time |
| `checkPayrollAnomalies(payroll, prev?)` | Detect anomalies, compare to previous month |
| `listForEmployee(companyId, employeeId, month)` | Employee self-service payroll query |
| `FormulaError` | Interface for formula evaluation error contract |
| `Anomaly` | Interface for anomaly detection result |
| `PayrollCalcResult` | Full calculation result type (fields: `tienPhat` replaces legacy `kpiTrachNhiem`/`otherDeductions`) |
| `PayrollSnapshot` | Immutable lock-time snapshot type |

### `src/hooks/usePayroll.ts`

SWR-based client hook for payroll data:
- `usePayroll({ month?, employeeId? })` — SWR hook hitting `GET /api/payroll`
- `generatePayroll(month, employeeIds?)` — `POST /api/payroll`
- `generateMissingPayroll(month)` — `POST /api/payroll` with `missingOnly: true`
- `updatePayrollStatus(id, status, note?)` — `PATCH /api/payroll/[id]`
- `deletePayroll(id)` — `DELETE /api/payroll/[id]`
- `recalculatePayroll(month)` — `POST /api/payroll/recalculate`
- `saveSalaryValues(month, employeeId, values)` — `POST /api/payroll/salary-values`

---

## Module Pages Summary

| Route | Rendering | Data Source |
|-------|-----------|-------------|
| `/` | Client Component (`'use client'`) | Static constants + SWR |
| `/login` | Client Component | `signIn()` from next-auth/react |
| `/nhanvien` | Client Component | `useEmployees()` SWR → `GET /api/employees` |
| `/chamcong` | Client Component | `useWorkUnits()`, `useOvertimeEntries()`, `useKpiViolations()`, `useDeductions()` |
| `/luong` | Client Component | `usePayroll()`, `useEmployees()` SWR hooks |
| `/nghiphep` | Client Component | `useLeaveRequests()` SWR → `GET /api/leave-requests` |
| `/phanquyen` | Client Component | Fetch `GET /api/permission-groups` |
| `/caidat` | Client Component | Fetch PITBracket, InsuranceRate, SalaryColumn, attendance settings APIs |
| `/doi-mat-khau` | Client Component | Direct API call for password update |

---

## External Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.2.3 | Framework — App Router, SSR/RSC, routing |
| `react` / `react-dom` | 19.2.4 | UI library |
| `next-auth` | ^5.0.0-beta.30 | Auth.js v5 — JWT sessions, Credentials provider |
| `@auth/prisma-adapter` | ^2.11.1 | Auth.js ↔ Prisma adapter (auth tables) |
| `@prisma/client` | ^7.7.0 | Generated Prisma DB client |
| `@prisma/adapter-pg` | ^7.7.0 | Direct PostgreSQL adapter for Prisma |
| `pg` | ^8.20.0 | PostgreSQL driver |
| `bcryptjs` | ^3.0.3 | Password hashing (cost 12) |
| `swr` | ^2.4.1 | Client-side data fetching with caching |
| `zod` | ^4.3.6 | Schema validation |
| `expr-eval` | ^2.0.2 | Sandboxed formula evaluator |
| `exceljs` | ^4.4.0 | Excel (.xlsx) export |
| `date-fns` | ^4.1.0 | Date utilities |
| `tailwindcss` | ^4 | Utility-first CSS |
| `shadcn` | ^4.2.0 | Component registry |
| `@radix-ui/*` | various | Headless UI primitives |
| `@base-ui/react` | ^1.3.0 | Additional Base UI primitives |
| `lucide-react` | ^1.8.0 | Icon library |
| `recharts` | ^3.8.1 | Chart components |
| `next-themes` | ^0.4.6 | Theme management |
| `openai` | latest | OpenAI SDK (server-only — not imported by client components) |
| `react-markdown` | ^10 | GFM markdown rendering in assistant bubbles |
| `remark-gfm` | ^4 | GitHub Flavored Markdown plugin for react-markdown |
| `class-variance-authority` | ^0.7.1 | Variant class composition |
| `clsx` + `tailwind-merge` | latest | Conditional class merging |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `prisma` | ^7.7.0 | Prisma CLI — migrations, generate |
| `vitest` | ^4.1.4 | Test runner |
| `@vitest/coverage-v8` | ^4.1.4 | Test coverage |
| `typescript` | ^5 | Type checking |
| `eslint` + `eslint-config-next` | 9 / 16.2.3 | Linting |
| `@tailwindcss/postcss` | ^4 | CSS processing |

---

## DB Schema — Full Table Reference

### Auth Tables (Auth.js PgAdapter)

| Table | Key Columns |
|-------|------------|
| `users` | `id` (cuid), `email` (unique), `password` (bcrypt), `role`, `permissions String[]`, `employeeId?` (unique), `companyId?` |
| `accounts` | `userId`, `provider`, `providerAccountId` (composite PK) |
| `sessions` | `sessionToken` (unique), `userId`, `expires` |
| `verification_tokens` | `identifier`, `token` (composite PK) |

### Company Tables

| Table | Key Columns |
|-------|------------|
| `companies` | `id`, `name`, `taxId` (unique), `address`, `director`, `bankAccount` |
| `company_settings` | `companyId` (unique), `workHoursPerDay`, `workDaysPerWeek`, `overtimeRate`, `leavePerYear`, `autoFillCronEnabled Boolean @default(true)`, `autoFillCronHour Int @default(18)`, `sheetSyncEnabled Boolean @default(false)`, `sheetSyncCronHour Int @default(19)`, `sheetUrl String?`, `sheetMonth String?` |

### HR Tables

| Table | Key Columns |
|-------|------------|
| `employees` | `id`, `companyId`, `fullName`, `email`, `department`, `position`, `status`, `contractType`, `baseSalary Decimal(15,0)`, `responsibilitySalary Decimal(15,0)`, `deletedAt?`, `excludeFromPayroll Boolean @default(false)` |
| `work_units` | `id`, `companyId`, `employeeId`, `date @db.Date`, `units Decimal(4,2)` — unique `(employeeId, date)`, `source String @default("UNKNOWN")`, `sourceBy String?` |
| `overtime_entries` | `id`, `companyId`, `employeeId`, `date @db.Date`, `hours Decimal(4,2)`, `source String @default("UNKNOWN")`, `sourceBy String?` |
| `kpi_violations` | `id`, `companyId`, `employeeId`, `date @db.Date`, `types String[]`, `source String @default("UNKNOWN")`, `sourceBy String?` |
| `deduction_events` | `id`, `companyId`, `employeeId`, `leaveRequestId?`, `date @db.Date`, `type DeductionType`, `delta Decimal(4,2)`, `status ApprovalStatus` |
| `leave_requests` | `id`, `companyId`, `employeeId`, `type LeaveType`, `startDate`, `endDate`, `totalDays`, `status ApprovalStatus` |

### Payroll Tables

| Table | Key Columns |
|-------|------------|
| `payrolls` | `id`, `companyId`, `employeeId`, `month @db.Date`, computed salary fields as `Decimal(15,0)` (`workSalary`, `overtimePay`, `mealPay`, `tienPhuCap`, `kpiChuyenCan`, `tienPhat`, `grossSalary`, insurance, `pitTax`, `netSalary`), `status PayrollStatus`, `needsRecalc Boolean`, `snapshot Json?`, `anomalies Json?` — unique `(employeeId, month)`. Note: `kpiBonus`, `bonus`, `kpiTrachNhiem`, `otherDeductions` columns were removed. |
| `salary_columns` | `id`, `companyId`, `key` (unique per company), `name`, `type`, `formula?`, `isEditable`, `isSystem`, `calcMode CalcMode`, `order` |
| `salary_column_versions` | `id`, `companyId`, `columnKey`, `formula?`, `effectiveFrom @db.Date` — unique `(companyId, columnKey, effectiveFrom)` |
| `salary_values` | `id`, `companyId`, `employeeId`, `month @db.Date`, `columnKey`, `value Decimal(15,2)` — unique `(employeeId, month, columnKey)`; FK on `(companyId, columnKey)` → `salary_columns(companyId, key)` with `ON DELETE RESTRICT ON UPDATE CASCADE` |

### Finance Tables

| Table | Key Columns |
|-------|------------|
| `revenue_records` | `id`, `companyId`, `date @db.Date`, `customer`, `category RevenueCategory`, `amount Decimal(15,0)` |
| `expense_records` | `id`, `companyId`, `date @db.Date`, `description`, `category ExpenseCategory`, `amount Decimal(15,0)`, `status ApprovalStatus` |
| `budget_records` | `id`, `companyId`, `period @db.Date`, `category`, `planned Decimal(15,0)` — unique `(companyId, period, category, department)` |
| `debt_records` | `id`, `companyId`, `type DebtType`, `amount Decimal(15,0)`, `paid Decimal(15,0)`, `dueDate @db.Date`, `isPaidOff Boolean` |

### Config Tables

| Table | Key Columns |
|-------|------------|
| `pit_brackets` | `id`, `companyId`, `minIncome Decimal(15,0)`, `maxIncome Decimal(15,0)?`, `rate Decimal(5,4)`, `validFrom @db.Date`, `validTo @db.Date?` |
| `insurance_rates` | `id`, `companyId`, `type InsuranceType`, `employeeRate Decimal(5,4)`, `employerRate Decimal(5,4)`, `validFrom`, `validTo?` |
| `permission_groups` | `id`, `companyId`, `name` (unique per company), `label`, `permissions String[]`, `isSystem Boolean` |
| `audit_logs` | `id`, `companyId`, `entityType`, `entityId`, `action`, `changedBy?`, `changes Json?`, `oldData Json?`, `newData Json?` |

### Attendance Config & Sync Tables

| Table | Key Columns |
|-------|------------|
| `sheet_sync_logs` | `id`, `companyId`, `month`, `sheetUrl`, `syncedAt`, `syncedBy` (email or "cron"), `status` ("ok"\|"error"), `durationMs`, `rowsAffected Json`, `errorMessage?` — append-only audit |

### AI Tables

| Table | Key Columns |
|-------|------------|
| `ai_config` | `id`, `companyId` (unique), `provider`, `model`, `apiKeyEncrypted`, `apiKeyIv`, `apiKeyLast4`, `systemPromptAdmin`, `systemPromptManager`, `systemPromptEmployee`, `companyRules`, `enabled Boolean`, `monthlyTokenLimit Int` |
| `ai_conversations` | `id`, `companyId`, `userId`, `title?`, `createdAt`, `updatedAt` — 1:N to `ai_messages` with cascade delete |
| `ai_messages` | `id`, `conversationId`, `role` (user/assistant/tool), `content`, `toolCalls Json?`, `createdAt` |
| `ai_usage_logs` | `id`, `companyId`, `userId`, `month @db.Date`, `inputTokens Int`, `outputTokens Int`, `requestCount Int` — unique `(companyId, userId, month)`; upserted atomically |

---

## Data Flow

### Client Data Fetching (SWR Pattern)

```
Browser (Client Component)
  └── useSWR("/api/<resource>?params") → fetcher → fetch()
        └── Route Handler (src/app/api/***/route.ts)
              ├── auth() → JWT session → companyId, role, permissions
              ├── RBAC check (inline or via hasPermission())
              └── Prisma query → PostgreSQL
```

### Payroll Mutation Flow

```
Client (luong/page.tsx)
  └── generatePayroll(month) → POST /api/payroll
        └── Route Handler
              ├── auth() → companyId
              ├── GeneratePayrollSchema.safeParse(body)
              ├── db.employee.findMany({ status in [WORKING, HALF, REMOTE] })
              └── upsertPayroll(companyId, employeeId, monthStr)
                    └── calculatePayroll() → 8 parallel DB queries
                          ├── WorkUnit.findMany
                          ├── DeductionEvent.findMany (APPROVED only)
                          ├── OvertimeEntry.findMany
                          ├── SalaryValue.findMany
                          ├── getInsuranceRates() → InsuranceRate DB
                          ├── getPITBrackets() → PITBracket DB
                          └── getColumnsForMonth() → SalaryColumn + SalaryColumnVersion DB
```

### Attendance → Auto-Recalc Flow

All three WorkUnit mutation paths now trigger payroll recalc (fire-and-forget, `.catch(console.warn)`):

```
POST /api/work-units (cell upsert)
  └── db.workUnit.upsert
        └── autoRecalcDraftPayroll(companyId, employeeId, dateObj) [fire-and-forget]
              └── db.payroll.findUnique → check status === "DRAFT" → upsertPayroll()

DELETE /api/work-units?employeeId=&month= (bulk wipe)
  └── db.workUnit.deleteMany
        └── autoRecalcDraftPayroll(companyId, employeeId, monthStart) [fire-and-forget]

POST /api/work-units/auto-fill (createMany)
  └── db.workUnit.createMany
        └── recalculateMonth(companyId, monthStart) [fire-and-forget]
              └── recalculate ALL DRAFT payrolls for that month
```

`chamcong-guard` (`src/lib/chamcong-guard.ts`) blocks mutations when the employee's payroll for that month is not DRAFT. Helper `lockedEmployeeIdsForMonth(companyId, monthStart, employeeIds)` returns a Set of employee IDs with non-DRAFT payrolls, used by both the auto-fill route and the dashboard manager-overview endpoint.

### Payroll Lock Flow

```
Client → PATCH /api/payroll/[id] { status: "LOCKED" }
  └── Route Handler
        ├── auth() + permission check (luong.approve)
        ├── buildPayrollSnapshot() — captures full calc state OUTSIDE transaction
        └── db.$transaction()
              ├── payroll.updateMany({ where: { id, status: "APPROVED" }, data: { status: "LOCKED", snapshot } })
              ├── count === 0 → throw concurrency error
              └── auditLog.create({ action: "LOCKED", oldData, newData })
```
