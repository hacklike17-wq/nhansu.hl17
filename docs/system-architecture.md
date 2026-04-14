# System Architecture

**Project:** ADMIN_HL17 — nhansu.hl17
**Last Updated:** 2026-04-13

---

## 1. Architecture Overview

ADMIN_HL17 is a full-stack Next.js 16 application with App Router + PostgreSQL + Prisma ORM. The architecture uses a client-heavy pattern: module pages are Client Components that fetch data via SWR hooks hitting Next.js Route Handlers. The Route Handlers in turn call a service layer backed by Prisma.

```
Browser (Client Components — 'use client')
  └── SessionProvider (Auth.js v5)
        └── AuthProvider (context bridge — useAuth hook)
              └── React UI (Tailwind CSS v4 + Recharts + shadcn/ui)
                    └── SWR hooks → fetch() → Route Handlers

Next.js Edge Runtime
  └── middleware.ts (Auth.js v5 authConfig — Edge-safe, JWT)
        └── RBAC enforcement via ROUTE_PERMISSION map

Next.js Node.js Runtime (Route Handlers)
  ├── src/app/api/**/route.ts
  │     ├── auth() → JWT session (role, permissions, companyId)
  │     ├── Zod validation
  │     └── Service Layer (src/lib/services/payroll.service.ts)
  │           └── Prisma Client (src/lib/db.ts — PrismaPg adapter)
  │                 └── PostgreSQL
  │                       ├── Auth tables: users, accounts, sessions
  │                       ├── HR tables: employees, work_units, deduction_events, leave_requests, payrolls
  │                       ├── Payroll config: salary_columns, salary_column_versions, salary_values
  │                       ├── Finance tables: revenue_records, expense_records, budget_records, debt_records
  │                       └── Config tables: pit_brackets, insurance_rates, permission_groups, audit_logs
  └── src/app/api/export/payroll/route.ts (Excel file response via ExcelJS)
```

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.2.3 |
| UI Library | React | 19.2.4 |
| Language | TypeScript | 5.x (strict) |
| Styling | Tailwind CSS | 4.x |
| Component Library | shadcn/ui | 4.2.0 |
| Headless Primitives | Radix UI + Base UI | various |
| Icons | Lucide React | 1.8.0 |
| Charts | Recharts | 3.8.1 |
| Theme | next-themes (forcedTheme="light") | 0.4.6 |
| Authentication | Auth.js v5 (next-auth@beta) | 5.0.0-beta.30 |
| DB Adapter | @auth/prisma-adapter | 2.11.1 |
| ORM | Prisma | 7.7.0 |
| DB Driver | pg + @prisma/adapter-pg | 8.20.0 / 7.7.0 |
| Client Data Fetching | SWR | 2.4.1 |
| Validation | Zod | 4.3.6 |
| Formula Engine | expr-eval | 2.0.2 |
| Excel Export | ExcelJS | 4.4.0 |
| Password Hashing | bcryptjs | 3.0.3 |
| Date Utilities | date-fns | 4.1.0 |
| Testing | Vitest | 4.1.4 |
| CSS Processing | @tailwindcss/postcss | 4.x |
| Linting | ESLint 9 (flat config) | — |

---

## 3. Application Layers

### 3.1 Routing Layer (Next.js App Router)

All routes are file-system based under `src/app/`. Vietnamese route paths reflect business terminology:

```
/                    → app/page.tsx              (Dashboard)
/login               → app/login/page.tsx        (Authentication)
/nhanvien            → app/nhanvien/page.tsx      (Employee management)
/chamcong            → app/chamcong/page.tsx      (Attendance + overtime + KPI)
/luong               → app/luong/page.tsx         (Payroll workflow)
/nghiphep            → app/nghiphep/page.tsx      (Leave requests)
/tuyendung           → app/tuyendung/page.tsx     (Recruitment)
/phanquyen           → app/phanquyen/page.tsx     (Permission groups)
/caidat              → app/caidat/page.tsx        (Settings — PIT, insurance, salary config)
/doi-mat-khau        → app/doi-mat-khau/page.tsx  (Password change)

/api/auth/[...nextauth]              → Auth.js handler
/api/employees/[id]?                 → Employee CRUD; PATCH has implicit self-edit branch for employees
/api/work-units/[id]?                → WorkUnit CRUD + autoRecalc trigger
/api/work-units/auto-fill            → POST — bulk attendance auto-fill + recalculateMonth
/api/overtime/[id]?                  → OvertimeEntry CRUD
/api/kpi-violations/[id]?            → KpiViolation CRUD
/api/deductions/[id]?                → DeductionEvent CRUD
/api/leave-requests/[id]?            → Leave request CRUD + approve/reject
/api/payroll/[id]?                   → Payroll generate + status transitions + delete
/api/payroll/recalculate             → Bulk recalculate DRAFT for month
/api/payroll/salary-values           → Manual input values (tienPhuCap, thuong, tienTruKhac)
/api/salary-columns/[id]?            → SalaryColumn CRUD (config)
/api/permission-groups/[id]?         → PermissionGroup CRUD
/api/export/payroll                  → Excel export (GET, file response)
/api/dashboard/manager-overview      → GET — today's pulse + action queue + month progress
/api/dashboard/manager-team          → GET — per-employee row: status, công, KPI count, payroll status
```

### 3.2 Layout and Shell Layer

```
RootLayout (app/layout.tsx)          ← Server Component
  └── ThemeProvider (forcedTheme="light")  ← Client, next-themes
        └── AuthProvider             ← Client, SessionProvider + useAuth hook
              └── ProtectedLayout    ← Client, layout shell + redirect guard
                    ├── Sidebar      ← Client, permission-filtered nav
                    ├── Topbar
                    └── Page Content (Client Component with SWR data)
```

`ProtectedLayout` checks `user` from `useAuth()`. If not logged in, redirects to `/login`. If on `/login` while logged in, redirects to `/`.

### 3.3 Authentication Layer

#### Auth.js v5 Split-Config Pattern (Edge-Safe)

**`src/auth.config.ts` (Edge-safe — no DB import):**
- `pages: { signIn: "/login" }`
- `session: { strategy: "jwt" }` — JWT tokens, not DB sessions
- `callbacks.authorized`: route guard — checks `auth?.user`, handles `/login` redirect, enforces RBAC via `ROUTE_PERMISSION` + `hasPermission()`
- `callbacks.jwt`: injects `id`, `role`, `permissions`, `employeeId`, `companyId` into token at login
- `callbacks.session`: copies token fields to session object (for `useSession()` access in client)
- Imported by `middleware.ts` (Edge runtime)

**`src/auth.ts` (Node.js only):**
- Extends `authConfig` with `PrismaAdapter(db)` (for auth tables: Account, Session, VerificationToken)
- `Credentials` provider with `authorize()`:
  1. `LoginSchema.safeParse(credentials)`
  2. `db.user.findUnique({ where: { email } })`
  3. Employee `accountStatus` check (LOCKED/NO_ACCOUNT → return null)
  4. `bcrypt.compare(password, user.password)`
  5. Permission resolution: DB `permission_groups` → `User.permissions` field → static `PERMISSION_GROUPS` fallback
  6. Returns user object with custom JWT fields

**`src/middleware.ts` (Edge runtime):**
```typescript
export default NextAuth(authConfig).auth
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"]
}
```

#### JWT Session Shape

Defined via `src/types/next-auth.d.ts` type augmentation:
```typescript
interface Session {
  user: {
    id: string
    role: string
    permissions: string[]   // e.g., ["luong.view", "luong.edit"]
    employeeId?: string | null
    companyId?: string | null
  } & DefaultSession["user"]
}
```

Accessing in Route Handlers:
```typescript
const session = await auth()
const companyId = (session.user as any).companyId
const role = (session.user as any).role
const permissions: string[] = (session.user as any).permissions ?? []
```

Note: The current implementation uses `strategy: "jwt"` (not DB sessions). Session changes (permission updates) take effect on next login, not immediately.

### 3.4 Permission Layer

1. Permissions resolved in `authorize()` callback during login:
   - Lookup `permission_groups` by `(companyId, role)` from DB
   - If no DB group found, fall back to static `PERMISSION_GROUPS` in `constants/data.ts`
   - If `User.permissions` array is non-empty, use it directly (per-user override)
2. Stored in JWT token — no DB lookup on subsequent requests
3. `permissions` array available in:
   - `middleware.ts` (Edge) via `authorized` callback
   - Route Handlers via `auth()` → `session.user.permissions`
   - Client Components via `useSession()` → `session.user.permissions`
4. `hasPermission()` from `constants/data.ts` — pure utility function, Edge-safe

**Permission check logic (unchanged across all layers):**
```
hasPermission(permissions, required)
  → true if permissions includes '*'
  → true if permissions includes required exactly
  → true if permissions includes '<module>.*'
  → false otherwise
```

### 3.5 Data Layer

#### SWR Client Data Flow

```
Client Component (page.tsx — 'use client')
  └── useSWR("/api/<resource>?params", fetcher)
        └── fetch() → HTTP GET
              └── Route Handler (src/app/api/***/route.ts)
                    ├── auth() → JWT session
                    ├── RBAC check
                    ├── Prisma query (scoped to companyId from session)
                    └── NextResponse.json(data)
```

SWR caches responses in memory. After mutations, call `mutate()` from the SWR hook to trigger revalidation.

#### Service Layer (Payroll)

The `payroll.service.ts` is the only service file. It contains:
- `calculatePayroll()` — 8 parallel DB queries, topological formula evaluation, PIT + insurance calculation, anomaly detection
- `upsertPayroll()` — create or update DRAFT row with guard against non-DRAFT rows
- `autoRecalcDraftPayroll()` — triggered by WorkUnit POST (cell upsert) and WorkUnit DELETE (bulk wipe) Route Handlers; fire-and-forget with `.catch(console.warn)`
- `recalculateMonth()` — bulk recalculate all DRAFT payrolls for a month; triggered by auto-fill `createMany`; fire-and-forget with `.catch(console.warn)`
- `buildPayrollSnapshot()` — immutable snapshot for LOCK transition
- `markDraftPayrollsStale()` — sets `needsRecalc=true` without recalculating

**Key data design decisions:**
- `BudgetRecord.actual`: computed on read via `db.expenseRecord.groupBy()` — not stored
- `CashflowItem`: derived view (merge Revenue + Expense) — no separate table
- `PITBracket` + `InsuranceRate`: stored in DB with time-validity — editable via Settings UI
- `SalaryColumnVersion`: formula history — recalculating a past month uses the formula that was active then
- All VND amounts: `Decimal @db.Decimal(15,0)` — converted to `Number` for JSON serialization
- **Payroll 3-tier data model** (normalized, enforced by DB FK):
  1. `salary_columns` — per-company column template: key, name, formula, calcMode, order
  2. `salary_values` — sparse per-employee × month manual inputs, keyed by `columnKey`; `SalaryValue.columnKey` references `SalaryColumn(companyId, key)` via FK (`ON DELETE RESTRICT ON UPDATE CASCADE`)
  3. `payrolls` — per-employee × month computed output + workflow status + snapshot
  Scalar shadow fields (`kpiBonus`, `bonus`, `kpiTrachNhiem`, `otherDeductions`) have been removed from the `payrolls` table. Dropping a `SalaryColumn` that has live `SalaryValue` rows is now blocked at the DB level; renaming a `SalaryColumn.key` cascades automatically to `SalaryValue`.

---

## 4. Component Relationships

### AuthProvider

```
AuthProvider
  ├── provides: user (JWT session snapshot), hasPermission(), isLoading
  ├── consumed by: ProtectedLayout, Sidebar, all page components
  └── no localStorage (pure JWT session)

useAuth() hook interface:
  { user: AuthUser | null, hasPermission: (perm: string) => boolean, isLoading: boolean }
```

### middleware.ts

```
middleware.ts (Edge — runs on every non-static request)
  ├── calls authConfig.callbacks.authorized
  ├── checks: JWT valid → user exists
  ├── checks: pathname === "/login" → redirect if logged in
  ├── checks: ROUTE_PERMISSION[pathname] → hasPermission() → allow or false (→ 401/redirect)
  └── uses: auth.config.ts only (no Prisma, no db import)
```

### Route Handlers

```
Route Handler (src/app/api/***/route.ts)
  ├── auth() → JWT session
  ├── companyId, role, permissions from session
  ├── RBAC check via hasPermission()
  ├── Zod schema validation
  ├── db.* direct query or service function
  └── autoRecalcDraftPayroll() after attendance mutations
```

### Payroll Service

```
payroll.service.ts
  ├── calculatePayroll()
  │     ├── 8 parallel DB queries (employee, workUnits, deductions, overtimeEntries,
  │     │                          salaryValues, insuranceRates, pitBrackets, salaryColumns)
  │     ├── buildDependencyGraph() → topologicalSort()
  │     ├── evalFormula() for each formula column in order
  │     ├── calcPIT() or calcPITFallback()
  │     ├── checkPayrollAnomalies() vs prev month
  │     └── returns PayrollCalcResult
  └── upsertPayroll()
        ├── guard: status !== "DRAFT" → return existing row
        ├── calculatePayroll()
        └── db.payroll.upsert()
```

---

## 5. State Management

| State | Owner | Persistence |
|-------|-------|-------------|
| Authenticated user session | Auth.js v5 JWT | HttpOnly cookie + JWT |
| User permissions | JWT token | HttpOnly cookie |
| Module data (payroll, employees, etc.) | SWR cache | Memory (cleared on refresh) |
| UI state (search, filters, modal open) | `useState` | None — reset on navigation |
| Employee list column visibility | `localStorage` key `nhansu.list-visible-cols` | localStorage (hydrated after mount) |
| Employee self-profile field visibility | `localStorage` key `nhansu.self-visible-fields` | localStorage (hydrated after mount) |
| Payroll row state | PostgreSQL `payrolls` table | Database |
| Formula column config | PostgreSQL `salary_columns` | Database |
| Manual salary inputs | PostgreSQL `salary_values` table | Database |
| PITBracket, InsuranceRate | PostgreSQL config tables | Database |
| Audit trail | PostgreSQL `audit_logs` table | Database (immutable) |
| Payroll calc snapshot | `payrolls.snapshot` JSON | Database (immutable after LOCKED) |

No Redux, Zustand, or other global state libraries. localStorage is used only for UI column/field visibility preferences (non-sensitive; hydrated client-side after mount to avoid SSR mismatch).

---

## 6. Rendering Strategy

| Component | Rendering | Notes |
|-----------|-----------|-------|
| `app/layout.tsx` | Server Component | Wraps client providers |
| `app/<module>/page.tsx` | Client Component | `'use client'` + SWR hooks |
| `app/api/**/route.ts` | Route Handler | Node.js runtime |
| `AuthProvider.tsx` | Client Component | SessionProvider + thin context bridge |
| `ProtectedLayout.tsx` | Client Component | Layout + redirect guard |
| `Sidebar.tsx` | Client Component | Permission-filtered nav |
| `middleware.ts` | Edge Runtime | Auth + RBAC on every request |
| `src/auth.config.ts` | Edge-safe module | No DB import |
| `src/auth.ts` | Node.js only | PrismaAdapter + Credentials |
| `src/lib/services/payroll.service.ts` | Node.js only | Server-side calculation |

---

## 7. Payroll Calculation Architecture

The payroll engine is the most complex part of the system, implemented over 13 phases:

```
calculatePayroll(companyId, employeeId, monthDate)
│
├── Phase 08: getColumnsForMonth(companyId, monthDate)
│     ├── db.salaryColumn.findMany
│     └── db.salaryColumnVersion.findMany (effectiveFrom <= monthStart)
│           └── merge: use version formula if available, else live formula
│
├── 7 parallel queries (Promise.all):
│   ├── employee record (baseSalary, responsibilitySalary)
│   ├── workUnits (công số nhận for month)
│   ├── deductionEvents (APPROVED, delta values)
│   ├── overtimeEntries (hours for month)
│   ├── salaryValues (manual inputs: tienPhuCap, thuong, tienTruKhac, kpiChuyenCan)
│   ├── insuranceRates (BHXH, BHYT, BHTN — time-valid)
│   └── pitBrackets (progressive brackets — time-valid)
│
├── Phase 01: formula evaluation
│   ├── buildDependencyGraph(columns) — inter-column deps
│   ├── topologicalSort(graph) — evaluation order
│   └── for each column in sorted order:
│         ├── skip if SKIP_FORMULA_KEYS (tong_thuc_nhan)
│         ├── cascade detection: if any dep missing from vars → FormulaError("cascade")
│         ├── evalFormula(formula, vars) → number | null
│         ├── null → FormulaError("invalid_result"); do NOT set vars[key]
│         └── success → vars[key] = result
│
├── Salary component mapping:
│   ├── workSalary = vars["tong_luong_co_ban"] ?? baseSalary * netWorkUnits / 26
│   ├── overtimePay = vars["tien_tang_ca"] ?? baseSalary / 26 / 8 * overtimeHours * 1.5
│   └── mealPay = vars["tien_an"] ?? netWorkUnits * 35_000
│
├── grossSalary = workSalary + overtimePay + responsibilitySalary + mealPay
│               + tienPhuCap + thuong + kpiChuyenCan - tienPhat
│   (kpiChuyenCan is a bonus/positive; tienPhat = tienTruKhac deduction)
│
├── Insurance (on baseSalary):
│   ├── bhxhEmployee = round(baseSalary * bhxhRate)  // default 8%
│   ├── bhytEmployee = round(baseSalary * bhytRate)  // default 1.5%
│   └── bhtnEmployee = round(baseSalary * bhtnRate)  // default 1%
│
├── PIT (progressive):
│   ├── taxableIncome = max(0, gross - totalInsurance - 11_000_000)
│   └── calcPIT(taxableIncome, pitBrackets) or calcPITFallback()
│
├── netSalary = max(0, gross - totalInsurance - pitTax)
│
└── Phase 09: checkPayrollAnomalies(result, prevMonthPayroll)
      ├── NEGATIVE_NET: netSalary < 0 (error — blocks PENDING)
      ├── EXCESS_ATTENDANCE: congSoNhan > 31 (error)
      ├── TAX_EXCEEDS_GROSS: pitTax > grossSalary (error)
      ├── ZERO_GROSS_WITH_ATTENDANCE: grossSalary = 0 && congSoNhan > 0 (warning)
      └── LARGE_CHANGE: |net - prevNet| / prevNet > 30% (warning)
```

---

## 8. CSS Architecture

Tailwind v4 via PostCSS (`postcss.config.mjs`). Design tokens in `globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme inline {
  /* shadcn/ui CSS variables as authoritative tokens */
}
```

shadcn/ui CSS variables (`--background`, `--primary`, `--border`, etc.) are the authoritative token source. Tailwind theme values reference them via `var()`.

Dark mode is declared as a custom variant but `ThemeProvider` is configured with `forcedTheme="light"` — dark mode is disabled at the provider level.

---

## 9. Build and Development

### Environment Variables

```bash
# .env.local (never commit)
DATABASE_URL="postgresql://user:pass@localhost:5432/nhansu_hl17"
NEXTAUTH_SECRET="<minimum 32 bytes — generate: openssl rand -base64 32>"
```

`NEXTAUTH_URL` is optional in development (Next.js 16 infers it). Required in production deployment.

### Development Setup

```bash
npm install
npm run db:migrate    # prisma migrate dev
npm run db:seed       # seed initial data
npm run dev           # Turbopack dev server at localhost:3000
```

### Production Build

```bash
npm run build   # postinstall runs "prisma generate" automatically
npm run start
```

Vercel deployment: `prisma migrate deploy && next build` as build command.

---

## 10. Security Architecture

| Concern | Implementation |
|---------|--------------|
| Password storage | bcryptjs hash, cost factor 12, in `User.password` |
| Session security | Auth.js v5 JWT — HttpOnly, Secure, SameSite=Lax cookies |
| Route RBAC | `middleware.ts` at Edge — enforces before page renders |
| Resource RBAC | Route Handlers check `hasPermission()` before mutations |
| Tenant isolation | All queries filter by `companyId` from JWT — never from request body |
| Employee scoping | `employee` role → `employeeId` from JWT session, not query params |
| Formula safety | `expr-eval` parser — sandboxed, no `eval()` or `new Function()` |
| Payroll immutability | LOCKED payrolls cannot be recalculated; `snapshot` JSON is write-once |
| Concurrency guard | `updateMany` + `count === 0` prevents double-approval race |
| Seed protection | `npm run db:seed` — production guard should be added to `seed.ts` |

### Remaining Considerations

- Rate limiting on `POST /api/auth/callback/credentials` — implement via hosting WAF
- JWT secret rotation: clear all session cookies + rotate `NEXTAUTH_SECRET` env var
- Permission changes take effect on next login only (JWT-based — no server-side revocation)
- Finance module pages (doanhthu, chiphi, etc.) use static/local data — no backend API yet

---

## 11. Architecture Decisions Record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth strategy | JWT (not DB sessions) | Edge-compatible; simpler deployment |
| Data fetching | SWR + Route Handlers (not RSC) | Client interactivity requirements |
| ORM | Prisma 7 | Type-safe, migration-based |
| DB connection | `@prisma/adapter-pg` (PrismaPg) | Direct pg connection without Prisma connection pool |
| VND storage | `Decimal @db.Decimal(15,0)` | No floating-point errors |
| Soft delete | `deletedAt` on Employee only | Payroll audit trail preserved |
| Multi-tenancy | `companyId` on all tables | Zero-cost now; avoids future migration |
| Formula engine | expr-eval (sandboxed) | Safe alternative to eval/Function |
| Formula evaluation | Topological sort | Handles inter-column dependencies |
| Formula versioning | `SalaryColumnVersion` + `effectiveFrom` | Historical payroll recalculation accuracy |
| Payroll immutability | `snapshot` JSON at LOCK time | Audit-grade record of calculation state |
| Anomaly detection | Error vs warning severity | Blocks dangerous transitions; warns on suspicious changes |
| Excel export | ExcelJS | Full xlsx support; runs server-side |
| PIT brackets | DB table + fallback | July 2026 reform: update DB, no redeploy |
| Personal deduction | Hardcoded 11,000,000 VND | Simple; update in service when reform takes effect |
| Budget actual | Computed on read | No sync bugs at current scale |
| Cashflow | Derived view (no table) | Avoids synchronization issues |
| SalaryValue FK | `ON DELETE RESTRICT ON UPDATE CASCADE` to SalaryColumn | Prevents orphan values; renames cascade; applied via `prisma db execute` |
| Payroll scalar fields | Removed `kpiBonus`, `bonus`, `kpiTrachNhiem`, `otherDeductions` | Were dead or double-writes; dynamic SalaryColumn/SalaryValue system is the source of truth |
| Employee self-edit | Implicit from ownership (no new permission) | `SELF_EDITABLE_FIELDS` whitelist in `[id]/route.ts` strips system fields before validation |
| Dashboard row order | Both manager-team and payroll ordered by `Employee.createdAt asc` | Ensures rows line up between dashboard table and payroll table |
| KPI violation count | Sum `types[].length` across rows, not count of rows | One KpiViolation row holds multiple codes in `types: String[]` |
| Missing attendance filter | Exclude employees with non-DRAFT payroll | chamcong-guard blocks mutations; missing attendance is not actionable for locked employees |
| Column visibility persistence | `localStorage` keys `nhansu.list-visible-cols`, `nhansu.self-visible-fields` | Hydrated after mount to avoid SSR mismatch; non-sensitive preference data |
| Prisma schema migration | `prisma db execute` for post-drift changes | `migrations/` directory has 3 files but DB has drifted; `migrate dev` would require destructive reset |
