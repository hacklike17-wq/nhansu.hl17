# nhansu.hl17 — ADMIN_HL17

**Hệ thống quản trị nhân sự** — Vietnamese HR management SaaS for SMEs.

Built with Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, PostgreSQL (Prisma 7), and Auth.js v5.

---

## What This Is

ADMIN_HL17 is a full-stack HR and payroll management system for Vietnamese SMEs. The system covers two primary domains:

- **Nhân sự (HR):** Employee records, attendance (chấm công), payroll (lương & thưởng), leave requests (nghỉ phép), recruitment (tuyển dụng)
- **Tài chính (Finance):** Revenue (doanh thu), expenses (chi phí), cashflow (dòng tiền), budget (ngân sách), debt/receivables (công nợ)

All currency is Vietnamese Dong (VND). All UI labels and status strings are in Vietnamese.

**Current status:** Full-stack production system with PostgreSQL backend, Auth.js v5 JWT sessions, RBAC middleware, and a complete 13-phase payroll engine.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.3 (App Router, Turbopack) |
| UI | React 19.2.4, TypeScript 5, Tailwind CSS v4, shadcn/ui |
| Authentication | Auth.js v5 (next-auth@beta) + JWT sessions |
| Database | PostgreSQL via Prisma 7 + `@prisma/adapter-pg` |
| ORM | Prisma 7.x (generated client at `src/generated/prisma`) |
| Data fetching | SWR (client hooks) + Route Handlers |
| Validation | Zod 4 |
| Formula engine | expr-eval (sandboxed, topological sort, circular detection) |
| Excel export | ExcelJS |
| Password hashing | bcryptjs (cost 12) |
| Charts | Recharts |
| Icons | Lucide React |
| Testing | Vitest (24 unit tests for formula engine) |

---

## Getting Started

**Requirements:** Node.js 20+, PostgreSQL (local or [Neon](https://neon.tech))

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment**

```bash
cp .claude/.env.example .env.local
# Edit .env.local:
# DATABASE_URL="postgresql://user:pass@localhost:5432/nhansu_hl17"
# NEXTAUTH_SECRET="$(openssl rand -base64 32)"
```

**3. Set up database**

```bash
npm run db:migrate   # apply schema migrations
npm run db:seed      # seed initial data (development only)
```

> **Prisma migration note:** `prisma/migrations/` does not represent the full current DB schema — several changes were applied directly via `prisma db execute`. Do NOT run `prisma migrate dev` against a database with live data; it will detect drift and offer to reset. Use `prisma db execute` for incremental changes and update `schema.prisma` manually. After any schema change, **fully restart the dev server** — hot-reload does not refresh the cached PrismaClient. Queries to changed columns will fail with `P2022 ColumnNotFound` if you only hot-reload.

**4. Start development server**

```bash
npm run dev -- -p 3003
```

Open [http://localhost:3003](http://localhost:3003). Default credentials are in `src/constants/data.ts` (`EMPLOYEES` array, `accountEmail` + `accountPassword` fields).

> Local dev runs on port **3003** (not 3000) to avoid conflicts. Production VPS runs on port **3010** via pm2 process `nhansu`.

### Available Scripts

```bash
npm run dev -- -p 3003   # development server (Turbopack, port 3003)
npm run build            # production build
npm run start            # production server
npm run lint             # ESLint
npm run db:migrate       # prisma migrate dev
npm run db:seed          # seed database (development only)
npm run db:reset         # prisma migrate reset --force
npm run test             # vitest run
npm run test:watch       # vitest watch mode
npm run test:coverage    # vitest coverage
```

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # Route Handlers (payroll, employees, leave, export, etc.)
│   │   ├── auth/[...nextauth]/   # Auth.js handler
│   │   ├── employees/            # CRUD + [id]
│   │   ├── payroll/              # Generate, PATCH status, recalculate, salary-values
│   │   ├── leave-requests/       # CRUD + [id] approve/reject
│   │   ├── work-units/           # Attendance CRUD
│   │   ├── deductions/           # Deduction events
│   │   ├── overtime/             # Overtime entries
│   │   ├── kpi-violations/       # KPI violations
│   │   ├── salary-columns/       # Salary config CRUD
│   │   ├── permission-groups/    # RBAC groups
│   │   └── export/payroll/       # Excel export (ExcelJS)
│   └── <module>/page.tsx   # Module pages (client components using SWR hooks)
├── auth.config.ts          # Edge-safe Auth.js config (JWT strategy, RBAC callbacks)
├── auth.ts                 # Full Auth.js config (PrismaAdapter + Credentials)
├── middleware.ts            # Edge RBAC enforcement
├── components/
│   ├── auth/               # AuthProvider (SessionProvider bridge), ProtectedLayout
│   ├── layout/             # Sidebar, Topbar, PageShell, ThemeProvider
│   └── ui/                 # shadcn/ui primitives
├── constants/
│   └── data.ts             # PERMISSION_GROUPS, ROUTE_PERMISSION, hasPermission(), NAV_SECTIONS
├── hooks/                  # SWR data hooks: usePayroll, useEmployees, useWorkUnits, etc.
├── lib/
│   ├── db.ts               # Prisma client singleton (PrismaPg adapter)
│   ├── formula.ts          # evalFormula(), topologicalSort(), detectCircular(), validateFormula()
│   ├── schemas/            # Zod schemas: auth, employee, payroll, attendance
│   ├── services/
│   │   └── payroll.service.ts   # calculatePayroll(), upsertPayroll(), anomaly detection
│   ├── format.ts           # fmtVND(), fmtMoney(), fmtDate()
│   └── __tests__/          # Vitest unit tests (formula engine — 24 tests)
├── generated/prisma/       # Prisma generated client (auto, do not edit)
└── types/
    ├── index.ts            # TypeScript domain types
    └── next-auth.d.ts      # Session type augmentation
prisma/
├── schema.prisma           # Single-file schema (Prisma 7)
├── migrations/             # Migration history
├── seed.ts                 # Seed entry point
└── seed-salary-columns.ts  # Salary column seed data
```

---

## Modules and Routes

| Route | Vietnamese Name | Description |
|-------|----------------|-------------|
| `/` | Dashboard | KPI cards, charts, cashflow, employee status, budget |
| `/nhanvien` | Nhân viên | Employee roster, profiles, account management |
| `/chamcong` | Chấm công | Work units (công số nhận) + overtime + KPI violations |
| `/luong` | Lương & thưởng | Payroll with DRAFT→PENDING→APPROVED→LOCKED→PAID workflow |
| `/nghiphep` | Nghỉ phép | Leave requests and deduction events |
| `/tuyendung` | Tuyển dụng | Recruitment pipeline |
| `/phanquyen` | Phân quyền | Role and permission group management |
| `/caidat` | Cài đặt | Company profile, PITBracket, InsuranceRate, salary columns, AI config, excludeFromPayroll toggle (admin) |
| `/doi-mat-khau` | Đổi mật khẩu | Password change |

---

## AI Assistant

A floating chat widget (bottom-right, `460×600`) is mounted in `ProtectedLayout` and available to all authenticated users. The assistant uses role-specific system prompts and can call server-side tools to answer HR questions.

**What it does:**
- Admin: query company-wide employee list, payroll summaries, attendance aggregates, and KPI violations via 5 tool calls
- Manager/Employee: query own info, payslip, attendance, KPI violations, and leave history via 5 self-scope tools — cannot access other employees' data
- All roles: maintains per-conversation history (cap 20 messages) and renders responses as GFM markdown

**How to enable:**

1. Generate an encryption key and add it to `.env.local`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # → AI_ENCRYPTION_KEY="<64 hex chars>"
   ```
2. Navigate to `/caidat` → "Trợ lý AI" tab (admin only)
3. Enter your OpenAI API key, choose a model, configure role-specific system prompts and company rules, set a monthly token limit, and click "Kiểm tra kết nối"

**Security notes:**
- The API key is encrypted at rest with AES-256-GCM using `AI_ENCRYPTION_KEY`; the plaintext key never leaves the PATCH handler (GET returns only `apiKeyLast4`)
- Losing or rotating `AI_ENCRYPTION_KEY` invalidates every stored API key — admin must re-enter
- Tool context (`companyId`, `userId`, `role`, `employeeId`) is injected server-side from the JWT session; the LLM cannot influence scoping fields
- Self-scope tools ignore any employee ID the LLM might hallucinate and use `ctx.employeeId` exclusively

See `docs/system-architecture.md §11` for the full data-flow diagram and security invariants.

---

## Payroll Engine (13 Phases Complete)

The payroll module has been through 13 upgrade phases:

- **Formula engine** (expr-eval, topological sort, circular detection, `FormulaError` contract)
- **Salary Config UI** (CRUD columns with formula preview and validation)
- **Attendance sync** (auto-recalc on WorkUnit changes; `needsRecalc` flag)
- **Full CRUD** (generate missing payrolls, add employee, delete DRAFT)
- **Manual inputs** (`tienPhuCap`, `thuong`, `tienTruKhac` via `SalaryValue` model; keys normalized to match `SalaryColumn.key`; DB FK enforces referential integrity)
- **Backend-authoritative calculation** (no client-side math)
- **Workflow** (DRAFT→PENDING→APPROVED→LOCKED→PAID) + concurrency guard + `AuditLog` + immutable `snapshot`
- **`SalaryColumnVersion`** (formula versioning with effective date) + 24 Vitest unit tests
- **Anomaly detection** (negative net, excess attendance, large change warning) + Excel export (ExcelJS)
- **Multi-tenant RBAC** (`companyId` audit, employee self-scoping, permission matrix)

---

## Access Control

| Role | Key | Payroll Access |
|------|-----|---------------|
| Boss Admin | `boss_admin` | Full (`*`) |
| Administrator | `admin` | `luong.*` (all) |
| HR Manager | `hr_manager` | `luong.view`, `luong.edit` only |
| Accountant | `accountant` | `luong.view`, `luong.approve`, `luong.export` |
| Employee | `employee` | Own payslip only (`luong.view`) |

Route RBAC is enforced in `middleware.ts` at Edge runtime via the `authorized` callback. Permissions use `<module>.<action>` format.

---

## Key Architecture Decisions

- **JWT sessions** (not DB sessions): `session: { strategy: "jwt" }` in `auth.config.ts` — custom claims injected via `jwt` callback.
- **SWR for client data fetching**: All module pages use `useSWR` hooks hitting Route Handlers. No Server Components for data.
- **Service layer in Route Handlers**: `payroll.service.ts` contains all business logic — Route Handlers call services, not Prisma directly.
- **`Decimal @db.Decimal(15,0)` for VND**: No floating-point errors; converted to `Number` for JSON serialization.
- **Soft delete on Employee**: `deletedAt` field — resigned employees preserved for payroll audit trail.
- **`excludeFromPayroll` flag**: `Boolean @default(false)` on Employee — excludes an employee from payroll generation, cron auto-fill, sheet sync, dashboard counts, and exports without deleting the record. Toggle UI in `/caidat` (admin only). Utility at `src/lib/employee-filters.ts` (`PAYROLL_INCLUDED_WHERE`, `isPayrollExcluded`). `/api/employees` accepts `?includeExcluded=true` so `/caidat` and `/nhanvien` can still show the excluded admin.
- **PITBracket + InsuranceRate in DB**: Editable via Settings UI — no redeploy needed for tax law changes.
- **`needsRecalc` flag**: Set `true` on attendance mutations; cleared after recalculation. Never recalculates APPROVED/LOCKED/PAID rows.
- **Immutable payroll snapshot**: At LOCK time, full calc snapshot (vars, formula results, insurance rates, PIT brackets) is captured in `Payroll.snapshot` JSON.
- **Anomaly detection**: Error-level anomalies (negative net, tax > gross) block PENDING transition; warnings are shown but do not block.
- **Formula versioning**: `SalaryColumnVersion` records formula changes with `effectiveFrom` date — historical payroll recalculation uses the formula that was active at that month.
- **3-tier payroll data model**: `salary_columns` (template) → `salary_values` (sparse manual inputs with DB FK) → `payrolls` (computed output). Dropping a column blocked at DB level; key rename cascades automatically.
- **Chamcong ↔ Payroll sync closed**: All three WorkUnit mutation paths (POST upsert, DELETE bulk wipe, auto-fill createMany) trigger DRAFT payroll recalculation. `chamcong-guard` blocks mutations on non-DRAFT payrolls; missing attendance for locked employees is excluded from the manager action queue.
- **Employee self-edit**: `PATCH /api/employees/[id]` allows employees to update their own personal/bank fields (`fullName`, `phone`, `gender`, `address`, `bankName`, `bankAccount`) without `nhanvien.edit`. System fields remain admin-only.

---

## Documentation

Full documentation in `docs/`:

- `docs/project-overview-pdr.md` — Product requirements, functional specs, role matrix
- `docs/codebase-summary.md` — File structure, modules, DB schema, dependencies
- `docs/code-standards.md` — Patterns, conventions, service layer, approval pattern, auth patterns
- `docs/system-architecture.md` — Tech stack, component relationships, data flow, security
- `docs/project-roadmap.md` — Phase history (all 13 payroll phases + AI phases + recent changes) and future roadmap
- `docs/deployment-guide.md` — VPS deploy via `deploy.sh`, pm2 process `nhansu` (PORT=3010), env vars
- `docs/design-guidelines.md` — UI patterns, Tailwind classes, color palette
