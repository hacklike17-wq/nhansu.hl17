# System Architecture

**Project:** ADMIN_HL17 — nhansu.hl17
**Last Updated:** 2026-05-02

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
  │                       ├── Config tables: pit_brackets, insurance_rates, permission_groups, audit_logs
                      └── Sync tables: sheet_sync_logs
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
/api/ai/config                       → GET (strips key), PATCH — AiConfig upsert (admin only)
/api/ai/test                         → POST — validate stored config in one click (admin only)
/api/ai/chat                         → POST — chat with tool-calling loop; enforces token cap; logs usage
/api/ai/chat/conversations           → GET — user's 50 most recent conversations
/api/ai/chat/conversations/[id]      → GET full messages, DELETE (cascade); 404 on ownership mismatch
/api/ai/usage                        → GET — monthly token/cost summary with byUser breakdown (admin only)
/api/settings/attendance             → GET — attendance cron + sheet sync settings + lastSync; PATCH — update (admin only)
/api/sync/google-sheet               → POST — manual "Đồng bộ ngay"; advisory-locked per company (admin only)
/api/sync/check-sheet                → POST — "Kiểm tra sheet"; QA scan for text-cells-that-look-like-numbers (admin only)
/api/cron/auto-fill-attendance       → POST (Bearer CRON_SECRET) — hourly; self-filters by autoFillCronHour; skips Sunday
/api/cron/sync-sheet                 → POST (Bearer CRON_SECRET) — hourly; self-filters by sheetSyncCronHour; 7 days/week
/api/sheet-sync-logs                 → GET — list recent SheetSyncLog rows (?limit=10)
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
- **`excludeFromPayroll` filter**: `Employee.excludeFromPayroll Boolean @default(false)` gates 17 payroll-related entry points. Single source of truth in `src/lib/employee-filters.ts`. Direct Employee queries use `where: { excludeFromPayroll: false }`; aggregations on related tables use `where: { employee: { excludeFromPayroll: false } }`.
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

## 11. AI Assistant Architecture

### Data Flow

```
Browser (ChatWidget — 'use client')
  ├── on mount: reads localStorage("nhansu.ai.currentConversationId")
  │     └── GET /api/ai/chat/conversations/[id]
  │           ├── 404 → clear localStorage key, start fresh
  │           └── 200 → hydrate message history
  │
  └── user sends message → POST /api/ai/chat
        ├── auth() → JWT session → { companyId, userId, role, employeeId }
        ├── db.aiConfig.findUnique({ where: { companyId } })
        │     ├── !config.enabled → 403
        │     └── monthlyTokenLimit check: aggregate ai_usage_logs for VN month
        │           └── total >= limit → 429 (if limit > 0)
        ├── decryptApiKey(config.apiKeyEncrypted, config.apiKeyIv)  ← AI_ENCRYPTION_KEY
        ├── assemble system prompt:
        │     role === "admin" → systemPromptAdmin + role catalog + tool list
        │     role === "manager" → systemPromptManager + self-tool list + rule #3 (refuse cross-employee queries)
        │     role === "employee" → systemPromptEmployee + self-tool list + rule #3
        │     + companyRules appended to all
        ├── openaiChatWithTools(messages, tools, apiKey, model)
        │     ├── POST openai /v1/chat/completions (with tools)
        │     ├── if model returns tool_calls:
        │     │     for each call → tool.execute(args, ctx)  ← ctx from session, not LLM
        │     │     append role:"tool" messages → repeat (max 5 iterations)
        │     └── returns { content, usage, toolCalls[] }
        ├── db.aiMessage.create × 2 (user + assistant)
        └── db.aiUsageLog.upsert (companyId, userId, month) — atomic increment
              └── 200 { content, conversationId, toolCalls }
```

### Security Invariants

1. **API key never leaves the PATCH handler** — `GET /api/ai/config` strips `apiKeyEncrypted`/`apiKeyIv` and returns only `apiKeyLast4` + `hasApiKey`. The key is decrypted server-side at call time, never sent to the client.

2. **`AI_ENCRYPTION_KEY` is irreplaceable at rest** — losing or rotating the env var invalidates every stored ciphertext; admin must re-enter the OpenAI API key. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (64 hex chars = 32 bytes). Store alongside `NEXTAUTH_SECRET`; never commit.

3. **Tool context is session-injected** — `ToolContext` (`companyId`, `userId`, `role`, `employeeId`) is built from the server JWT session and passed into every tool `execute()` call. The LLM's tool arguments are parsed and validated but can never override scoping fields.

4. **Self-scope tools ignore LLM-supplied IDs** — `ensureEmployeeId(ctx)` returns `{ ok: false }` if the session has no `employeeId`. The five SELF_TOOLS always use `ctx.employeeId` for DB queries; any `employeeId` the LLM might hallucinate in args is silently discarded.

5. **Admin tools use server-side code lookup** — `get_employee_payroll` accepts either a cuid or a human code like `NV011`; it resolves to the DB record via `db.employee.findFirst({ where: { companyId, OR: [{ id }, { code }] } })`. The LLM cannot bypass `companyId` isolation by guessing an ID.

### Database Tables

| Table | Key Columns |
|-------|------------|
| `ai_config` | `companyId` (unique), `apiKeyEncrypted`, `apiKeyIv`, `apiKeyLast4`, `model`, `systemPromptAdmin`, `systemPromptManager`, `systemPromptEmployee`, `companyRules`, `enabled`, `monthlyTokenLimit` |
| `ai_conversations` | `companyId`, `userId`, `title?` — cascades to `ai_messages` on delete |
| `ai_messages` | `conversationId`, `role`, `content`, `toolCalls Json?` |
| `ai_usage_logs` | unique `(companyId, userId, month)` — `inputTokens`, `outputTokens`, `requestCount`; upserted atomically after each reply |

All AI tables were applied via `prisma db execute` (not via the migrations directory — see §17 of code-standards.md for the migration drift rule).

### Widget localStorage

The widget uses exactly one `localStorage` key: `nhansu.ai.currentConversationId`. It is not scoped by user ID because the server returns 404 for any conversation that does not belong to the caller's `userId`, and the widget clears the key on 404. This matches the non-sensitive preference pattern used by column/field visibility keys (`nhansu.list-visible-cols`, `nhansu.self-visible-fields`) — all hydrated after mount to avoid SSR mismatch.

### Tech Stack Additions (AI)

| Package | Purpose |
|---------|---------|
| `openai` | OpenAI SDK — server-only; imported only in `src/lib/ai/providers/openai.ts` |
| `react-markdown@^10` + `remark-gfm@^4` | GFM markdown rendering in assistant bubbles |

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
| AI current conversation ID | `localStorage` key `nhansu.ai.currentConversationId` | localStorage; cleared on server 404 |
| AI conversation history | PostgreSQL `ai_conversations` + `ai_messages` | Database |
| AI monthly token usage | PostgreSQL `ai_usage_logs` | Database (atomic upsert) |
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
| `src/lib/ai/providers/openai.ts` | Node.js only | OpenAI SDK — never imported by client |
| `src/lib/ai/tools/*.ts` | Node.js only | DB queries — never imported by client |
| `src/lib/ai/providers/models.ts` | Client-safe | Static constant only — no server imports |
| `src/lib/ai/providers/pricing.ts` | Client-safe | Pure functions — no server imports |
| `src/components/ai/ChatWidget.tsx` | Client Component | `'use client'` — floating chat widget |
| `src/app/caidat/_components/AiConfigTab.tsx` | Client Component | `'use client'` — admin AI config tab |

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
AI_ENCRYPTION_KEY="<64 hex chars — generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\">"
```

`NEXTAUTH_URL` is optional in development (Next.js 16 infers it). Required in production deployment.

`AI_ENCRYPTION_KEY` is required for the AI assistant feature. Its absence will cause the config tab to error on key save. Rotating this value invalidates all stored OpenAI API keys — admin must re-enter after rotation. See `docs/deployment-guide.md` for details.

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
| AI API key storage | AES-256-GCM encryption in `ai_config.apiKeyEncrypted`; key material is `AI_ENCRYPTION_KEY` env var |
| AI key exposure prevention | GET `/api/ai/config` returns `apiKeyLast4` + `hasApiKey` only; ciphertext never sent to client |
| AI tool isolation | `ToolContext` built from server JWT session; LLM arguments cannot override `companyId` or `userId` |
| AI self-scope defense | SELF_TOOLS call `ensureEmployeeId(ctx)` and query by `ctx.employeeId` — LLM-supplied IDs are ignored |
| AI token budget | Monthly cap enforced server-side before each OpenAI call; 429 returned when limit is met |

### Remaining Considerations

- Rate limiting on `POST /api/auth/callback/credentials` — implement via hosting WAF
- JWT secret rotation: clear all session cookies + rotate `NEXTAUTH_SECRET` env var
- Permission changes take effect on next login only (JWT-based — no server-side revocation)
- Finance module pages (doanhthu, chiphi, etc.) use static/local data — no backend API yet

---

## 12. Google Sheet Sync Architecture

### Overview

The "Cấu hình bảng công" tab in `/caidat` lets admins connect a Google Sheet export (xlsx) as the source of truth for attendance data. Sync can be triggered manually or run automatically on an hourly cron.

### Sheet Sync Data Flow

```
Admin configures in /caidat → AttendanceConfigTab
  └── PATCH /api/settings/attendance
        ├── validates sheetUrl via HEAD request
        ├── validates sheetSyncCronHour (0-23)
        └── upserts CompanySettings (sheetUrl, sheetMonth, sheetSyncEnabled, sheetSyncCronHour)

Manual sync: "Đồng bộ ngay" button
  └── POST /api/sync/google-sheet (admin only)
        └── sheet-sync.service.ts
              ├── pg_try_advisory_lock (hash of companyId) — prevents concurrent runs
              ├── google-sheet-fetcher.ts — fetch xlsx, parse 3 tabs (WorkUnit, OT, KPI)
              │     ├── rejects if any day is outside sheetMonth (Q10)
              │     └── missing tabs produce warnings, not errors (Q11)
              ├── for each tab: upsert rows (source="SHEET_SYNC", sourceBy=email)
              │     └── skip rows where WorkUnit.note is non-null (manager annotation wins — Q1)
              └── SheetSyncLog.create (status, durationMs, rowsAffected, errorMessage)

Cron sync: POST /api/cron/sync-sheet (Bearer CRON_SECRET)
  └── fires hourly; self-filters: only process companies where sheetSyncCronHour == currentVNHour
        └── same sheet-sync.service.ts path; sourceBy = "cron"
```

### Hourly-Cron-With-Filter Pattern

Both cron endpoints (`auto-fill-attendance` and `sync-sheet`) use the same pattern:

1. VPS crontab fires the endpoint every hour (`0 * * * *`)
2. The endpoint reads `currentVNHour` and filters to only process companies whose configured hour matches
3. Admins change the schedule via UI — no SSH required

This replaces the old approach where crontab itself encoded the schedule (e.g., `0 18 * * 1-6`).

### Advisory Lock (Concurrency Guard)

`sheet-sync.service.ts` acquires a PostgreSQL advisory lock before syncing:

```sql
SELECT pg_try_advisory_lock($1, $2)
```

- First arg: fixed namespace int
- Second arg: hash of `companyId` to a 32-bit int

If the lock cannot be acquired (another sync is in progress for the same company), the endpoint returns immediately without running. The lock is released when the transaction ends.

### source / sourceBy Audit Trail

Three tables now carry `source` and `sourceBy` fields: `work_units`, `overtime_entries`, `kpi_violations`.

| source value | When set |
|---|---|
| `MANUAL` | User creates/edits a record via UI |
| `AUTO_FILL` | Cron auto-fill or manual auto-fill button |
| `SHEET_SYNC` | Google Sheet sync (manual or cron) |
| `IMPORT` | JSON/CSV import via `/api/data/*/import` |
| `UNKNOWN` | Legacy rows created before this deploy |

`sourceBy` holds the user's email for manual actions, or `"cron"` for automated runs.

All 9 write paths tag `source` and `sourceBy` at the point of insert/upsert.

### Sheet QA Scan

`POST /api/sync/check-sheet` (and the CLI `scripts/check-sheet-text-cells.ts`) calls `sheet-check.service.ts` to identify cells that contain text values but look like numbers. These are common data-entry errors in Google Sheets that would silently produce zero công when parsed.

---

## 13. Architecture Decisions Record

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
| Cron schedule | Hourly fire + endpoint self-filter by DB hour | Admin can change schedule via UI without SSH; both auto-fill and sheet-sync use this pattern |
| Sheet sync concurrency | PostgreSQL advisory lock (2-arg int form) | Prevents parallel runs per company without a separate lock table |
| Sheet sync conflict rule | Preserve rows with non-null `note` | Manager's manual annotation wins over sheet data |
| source/sourceBy audit | `String @default("UNKNOWN")` + `String?` on WorkUnit, OvertimeEntry, KpiViolation | Trace every write to its origin (MANUAL/AUTO_FILL/SHEET_SYNC/IMPORT/UNKNOWN) and actor |
| Employee.code sync | Email as anchor in idempotent script | Swaps codes safely without a unique DB constraint on `code` |
| excludeFromPayroll flag | `Boolean @default(false)` on Employee; filter utility in `employee-filters.ts` | Excludes admin / non-payroll employees without soft-delete; 17 entry points use `PAYROLL_INCLUDED_WHERE`; exceptions in `/nhanvien` and `/caidat` use `?includeExcluded=true` |
| KPI codes expansion | `KpiViolationType` union + `KPI_CONFIG` + `VALID_CODES_GREEDY` | Added VS (về sớm), KL2 (nghỉ KL nửa ngày), OL (làm online); greedy parser ensures KL2 matched before KL in concatenated input |
