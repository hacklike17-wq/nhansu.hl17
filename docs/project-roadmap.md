# Project Roadmap

**Project:** ADMIN_HL17 — nhansu.hl17
**Last Updated:** 2026-05-02

---

## Completed Work

### Foundation (Production Migration)

The system migrated from a localStorage-based prototype to a full-stack PostgreSQL + Auth.js v5 production system:

- Prisma 7 schema (single file, `@prisma/adapter-pg` for direct PostgreSQL connection)
- Auth.js v5 with JWT sessions, Credentials provider, Edge-safe split config
- Route Handlers for all HR modules (employees, attendance, payroll, leave)
- SWR data fetching layer with client-side hooks
- RBAC middleware at Edge runtime

### Payroll Engine — 13 Phases (All Complete)

| Phase | Description | Key Deliverables |
|-------|-------------|-----------------|
| Phase 01 | Formula Engine | `evalFormula()` using `expr-eval`; `buildDependencyGraph()`; `topologicalSort()` |
| Phase 01b | Formula Safety | `FormulaError` contract; cascade detection; function never throws |
| Phase 02 | Salary Config UI | CRUD for `SalaryColumn`; formula preview via `validateFormula()`; circular detection at save |
| Phase 03 | Attendance Sync | Attendance mutations trigger `autoRecalcDraftPayroll()`; `needsRecalc` flag introduced |
| Phase 03b | Recompute Strategy | `markDraftPayrollsStale()` for bulk staleness marking; guard against recalculating non-DRAFT rows |
| Phase 04 | Attendance & Payroll CRUD | Generate missing payrolls; add employee to month; delete DRAFT payroll |
| Phase 05 | Manual Inputs | `SalaryValue` model for `phuCap`, `thuong`, `phat` manual inputs; saved via `/api/payroll/salary-values` |
| Phase 06 | System Standardization | Backend-authoritative payroll — all math server-side; removed client-side calc |
| Phase 07 | Workflow & Audit | Full DRAFT→PENDING→APPROVED→LOCKED→PAID workflow; `AuditLog` on every transition; concurrency guard |
| Phase 07b | Payroll Snapshot | Immutable `Payroll.snapshot` JSON at LOCK time; `PayrollSnapshot` type with full calc state |
| Phase 08 | Versioning & Testing | `SalaryColumnVersion` with `effectiveFrom` date; `getColumnsForMonth()` version lookup; 24 Vitest tests |
| Phase 09 | Anomaly Detection & Export | `checkPayrollAnomalies()` with error/warning severity; Excel export via ExcelJS at `/api/export/payroll` |
| Phase 10 | Multi-tenant RBAC | `companyId` audit on all queries; employee self-scoping enforced server-side; permission matrix for `hr_manager`/`accountant` |

### Bug Fixes (Post-Phase 10)

- Employee dropdown filter in payroll generate dialog
- Recalculate button UI refresh after recalculation
- Feedback messages for payroll status transitions
- Session `companyId` propagation fix

### Payroll Normalization & Dashboard Fixes (2026-04-13)

| Commit | Description |
|--------|-------------|
| `b63acbb` | Dashboard: `missingAttendanceCount` excludes employees with non-DRAFT payrolls; `lockedEmployeeIdsForMonth` helper introduced |
| `a57b0cd` | Dashboard: manager-team rows ordered by `Employee.createdAt asc` (matches payroll table); KPI count sums `types[].length` not row count; `monthWorkUnits` no longer rounded via `.toFixed(0)` |
| `339820e` | Chamcong: DELETE bulk wipe and auto-fill createMany now trigger `autoRecalcDraftPayroll` / `recalculateMonth`; closes the WorkUnit → payroll sync loop |
| `cb8cc13` | Payroll refactor: `SalaryValue` keys normalized to match `SalaryColumn.key` (`phu_cap` → `tien_phu_cap`, `phat` → `tien_tru_khac`); DB FK added on `salary_values(companyId, columnKey)` → `salary_columns(companyId, key)` |
| `e914a3b` | Payroll refactor: dropped 4 legacy scalar fields from `payrolls` table (`kpiBonus`, `bonus`, `kpiTrachNhiem`, `otherDeductions`); `PersonalSalaryView` updated; "Phạt" label renamed to "Trừ khác" |
| `59979d3` | Employee: self-edit branch in `PATCH /api/employees/[id]` with `SELF_EDITABLE_FIELDS` whitelist; manager column picker with localStorage persistence; employee self-profile field picker |

### Google Sheet Sync & Attendance Config (2026-04-19, all shipped)

| Commit | Description |
|--------|-------------|
| `d08dda0` | Employee: `Employee.code` re-aligned with customer Google Sheet; idempotent `scripts/sync-codes-with-sheet.ts` using email as anchor |
| `2c3f738` | Chamcong: KPI & WorkUnit letter-codes aligned with customer sheet (`ĐM / NP / KL / LT / QCC`); `NP` changed to 0 công; `LT` and `TS` added to `WORK_UNIT_CODE_MAP` |
| `c3a1c13` | Dead code removed: `DonutChart.tsx`, `RevenueChart.tsx`, `EmployeeTable.tsx` (orphan components); 5 empty constant arrays from `constants/data.ts` |
| `d91b42e` | Cấu hình bảng công: cron toggle + hour config + Google Sheet URL/month config; new `AttendanceConfigTab.tsx`; schema fields added to `CompanySettings`; `GET/PATCH /api/settings/attendance` |
| `3d1f0f5` | UX polish for Cấu hình bảng công tab; QA script `scripts/check-sheet-text-cells.ts` |
| `8648055` | "Kiểm tra sheet" button in UI; `POST /api/sync/check-sheet`; `sheet-check.service.ts` |
| `2114a0a` | Sheet sync cron configurable + advisory-lock per company; `source`/`sourceBy` audit fields on `WorkUnit`, `OvertimeEntry`, `KpiViolation`; new `SheetSyncLog` table; `POST /api/cron/sync-sheet`; auto-fill cron updated to use hourly-filter pattern |

**Key capabilities shipped:**
- Admin can configure auto-fill cron hour and Google Sheet sync hour/URL/month from `/caidat` without SSH
- Google Sheet sync: advisory-locked, month-validated, tab-independent, manager-note-preserving
- `source` + `sourceBy` audit trail on all 3 attendance tables (9 write paths tagged)
- Sheet QA scan detects text-cells that look like numbers before a sync
- `SheetSyncLog` table records every sync attempt (manual or cron) with duration, rows affected, and error

### AI Assistant — Phase 1 + 2.1–2.6 (2026-04-14, all shipped)

| Commit | Phase | Description |
|--------|-------|-------------|
| `68d5248` | Phase 1 | AI config foundation — `AiConfig` table, AES-256-GCM key encryption (`crypto.ts`), admin config tab in `/caidat`, OpenAI provider + model selector, test endpoint `POST /api/ai/test` |
| `bb32c62` | Phase 2.1 | Floating `ChatWidget` (bottom-right) + conversation-aware `POST /api/ai/chat`; `ai_conversations` + `ai_messages` tables; optimistic user message; widget admin-only in this phase |
| `33c8eb0` | Phase 2.2 | Tool calling + 5 admin tools (`get_company_overview`, `list_employees`, `get_employee_payroll`, `get_attendance_summary`, `get_kpi_violations`); `openaiChatWithTools()` max-5-iteration loop; `models.ts` client-safe split; violet tool badge in widget |
| `4baafdf` | Phase 2.3 | Self-scope tools (`get_my_info`, `get_my_payroll`, `get_my_attendance`, `get_my_kpi_violations`, `get_my_leave_history`) for manager/employee; widget open to all roles; `ensureEmployeeId()` defense; social-engineering guard in system prompt |
| `401c3ef` | Phase 2.4 | Conversation history — `GET/DELETE /api/ai/chat/conversations/[id]`; history overlay in widget; `nhansu.ai.currentConversationId` localStorage key; 404 silently clears key |
| `dbb9fea` | Phase 2.5 | Cost tracking — `ai_usage_logs` table; `pricing.ts` (client-safe); monthly token cap enforced before OpenAI call (429 on exceed); `GET /api/ai/usage`; cost progress bar in `AiConfigTab` |
| `09a22b4` | Phase 2.6 | UI polish — `react-markdown` + `remark-gfm` for GFM bubble rendering; `CopyButton` (hover-reveal, 1.5s green flash); auto-resize textarea; widget resized to 460×600 |

**AI Backlog (not yet scheduled):**
- Streaming responses (OpenAI streaming API + SSE to client)
- Multi-provider support: Anthropic (Claude) and Google (Gemini) — placeholders already in UI
- Usage alerts: email/in-app notification when a company reaches 80 % of token limit
- Tool audit log: record which tools were called per message for admin review
- Mobile-responsive widget (currently fixed 460px width)
- Export / search conversations (date range filter, keyword search)
- Finance AI tools — **deferred; waiting on real finance backend data** (finance modules still use static data)

---

### Post-April Fixes & Features (2026-04-20 – 2026-05-02)

| Commit | Description |
|--------|-------------|
| `4cc1a31` | **feat(employee):** `excludeFromPayroll Boolean @default(false)` field on Employee; filter utility `src/lib/employee-filters.ts` (`PAYROLL_INCLUDED_WHERE`, `isPayrollExcluded`); toggle UI in `/caidat` (admin only); 17 entry points patched. `/api/employees?includeExcluded=true` allows `/caidat` and `/nhanvien` to still see excluded admin. |
| `f161539` | **fix(dashboard):** aggregate queries (manager-overview, manager-team, export) now filter `excludeFromPayroll` via `employee: { excludeFromPayroll: false }` on related-table queries. |
| `4305650` | **chore(scripts):** `scripts/cleanup-excluded-employee-data.ts` — one-off script to delete historical attendance and payroll data for excluded employees. Default dry-run; `--commit` flag to actually delete. |
| `faf21c5` | **feat(kpi):** added 2 new KPI codes: `VS` (về sớm, units=1) and `KL2` (nghỉ không lương nửa ngày, units=0.5). Updated `KpiViolationType`, `KPI_CONFIG`, `WORK_UNIT_CODE_MAP`, `AttendanceKpiPanel`. `VALID_CODES_GREEDY` keeps `KL2` before `KL` for correct greedy parsing. |
| `63b4a18` | **fix(kpi-import):** greedy parser now correctly handles concatenated multi-code strings like `ĐMOL`, `QCCKL`, `KL2KL`. |
| `e3b300f` | **fix(chamcong):** clearing the note textarea on a WorkUnit cell now deletes the note from the DB (previously only cleared the UI). |
| `cd2ebd4` | **fix(sheet-sync):** MANUAL-source rows are preserved even when they have no note (previously only rows with a non-null note were preserved). |
| `6a0ed79` | **fix(sheet-sync):** header date cells parsed correctly under UTC offset — was returning date-1 for Vietnam dates. |
| `9af04b9` | **feat(chamcong):** hide the "Cập nhật công" button and remove the weekday row from overtime/KPI table header. |

## Current State (2026-05-02)

**What is fully working:**
- Authentication (login, JWT sessions, RBAC middleware)
- Employee management CRUD + soft delete + employee self-edit (personal/bank fields) + `excludeFromPayroll` flag (admin toggle in `/caidat`)
- Attendance: WorkUnit, OvertimeEntry, KpiViolation, DeductionEvent; all three WorkUnit mutation paths trigger DRAFT payroll recalc; `source`/`sourceBy` audit trail on all writes; 8 KPI codes: ĐM, VS, NP, KL, KL2, LT, QCC, OL
- Payroll: full calculation engine + workflow + anomaly detection + Excel export; 3-tier normalized data model (salary_columns → salary_values → payrolls) with DB FK enforcement; `responsibilitySalary` proration via configurable formula column (e.g., `luong_trach_nhiem / 26 * min(cong_so, 26)`)
- Leave requests: approval with batch DeductionEvent creation
- Settings: PITBracket, InsuranceRate, SalaryColumn CRUD, AI config, Cấu hình bảng công, excludeFromPayroll toggle (admin)
- Google Sheet sync: admin-configurable URL + month; advisory-locked per company; MANUAL-source rows preserved (with or without note); `SheetSyncLog` audit table; manual + cron modes; UTC date offset fix
- Configurable cron: auto-fill hour and sheet sync hour settable via UI (hourly-fire + endpoint-self-filter pattern)
- Sheet QA scan: "Kiểm tra sheet" button + `POST /api/sync/check-sheet` finds text-cells-that-look-like-numbers before syncing
- Permission groups: CRUD + system group protection
- Formula versioning with historical recalculation; `expr-eval` supports `min()`, `max()`, and standard math functions
- Manager dashboard: live team status table + action queue from DB (no static data); excludeFromPayroll employees excluded from all counts
- AI assistant: floating chat widget for all roles; role-based tool calling; conversation history; monthly token cap; GFM markdown rendering

**What is using static data (not yet backend-connected):**
- Dashboard KPI cards and charts (static from `constants/data.ts`)
- Finance modules: Doanh thu, Chi phí, Dòng tiền, Ngân sách, Công nợ
- Recruitment (Tuyển dụng)
- Reports (Báo cáo) — export triggers exist but data is static

---

## Near-Term Priorities

### 1. Finance Module Backend API

Connect the five finance modules to PostgreSQL:

- `GET/POST /api/revenue` — RevenueRecord CRUD
- `GET/POST /api/expenses` — ExpenseRecord CRUD + approval
- `GET /api/cashflow` — derived view (merge Revenue + Expense)
- `GET/POST /api/budget` — BudgetRecord CRUD + actual computed on read
- `GET/POST /api/debt` — DebtRecord CRUD

Each module page (`doanhthu`, `chiphi`, `dongtien`, `ngansach`, `congno`) would then use SWR hooks to fetch from the API instead of static constants.

### 2. Dashboard Backend Data

Replace static KPI data with real aggregates from the database:
- Total revenue/expense for current month (from `revenue_records`, `expense_records`)
- Active employee count (from `employees` where `deletedAt IS NULL`)
- Outstanding debt total (from `debt_records` where `isPaidOff = false`)
- Cashflow chart: 6-month rolling Revenue vs Expense

### 3. Recruitment (Tuyển dụng) Backend

Simple CRUD for job openings and applicant pipeline — requires a `JobOpening` model in Prisma schema.

### 4. Database Seed Hardening

- Add production guard to `seed.ts`: `if (process.env.NODE_ENV === "production") throw new Error("...")`
- Expand seed data beyond current `seed-salary-columns.ts`
- Add PITBracket seed data (2025 current + 2026 reform brackets)
- Add InsuranceRate seed data

---

## Medium-Term Roadmap

### PIT Reform (July 2026)

The personal income tax reform scheduled for July 2026 will change:
- PIT brackets (7 brackets with new thresholds)
- Personal deduction amount (currently hardcoded at 11,000,000 VND/month in `payroll.service.ts`)

Required changes:
1. Insert new `PITBracket` records with `validFrom: 2026-07-01` via Settings UI (no code change needed for brackets)
2. Update `PERSONAL_DEDUCTION` constant in `payroll.service.ts` (or move to DB config)
3. Test recalculation for July 2026 payrolls uses new brackets

### DB Session Migration

Current JWT sessions have a limitation: permission changes take effect only on next login. If immediate revocation is needed (e.g., for security incidents), migrate to DB sessions:

1. Change `session: { strategy: "database" }` in `auth.config.ts`
2. Remove `jwt` callback; keep `session` callback
3. Remove `jwt` type augmentation from `next-auth.d.ts`
4. Ensure `DATABASE_URL_DIRECT` is set for non-pooled connections (required for PgAdapter DB sessions)

### SWR Optimistic Updates

For better UX on payroll status transitions, implement SWR optimistic updates:
```typescript
// Optimistically update local data while request is in flight
mutate(
  currentPayrolls.map(p => p.id === id ? { ...p, status: "APPROVED" } : p),
  false // do not revalidate yet
)
await updatePayrollStatus(id, "APPROVED")
mutate()  // revalidate after confirmed
```

### Payroll PDF Payslip

Individual payslip PDF generation for employees:
- Route Handler: `GET /api/export/payslip?payrollId=<id>`
- Requires `luong.view` permission for own payslip; `luong.export` for others
- PDF library: consider `@react-pdf/renderer` or `puppeteer`

---

## Future Roadmap (v2.0)

### Multi-Tenancy UI

The data model is already multi-tenant ready (`companyId` on all tables). Adding UI multi-tenancy requires:
- Company switcher in the Topbar
- Separate `companyId` routing or subdomain routing
- Company registration / onboarding flow

### Email Notifications

- Leave approval/rejection notifications to employees
- Payroll processing notifications to HR/accountants
- Overdue debt alerts
- Provider: Resend or SendGrid

### Mobile PWA

Progressive Web App for employee self-service:
- View own payslip (monthly)
- Submit leave requests
- Check attendance records
- `manifest.json` + service worker for offline support

### Real-Time Updates

WebSocket or Server-Sent Events for:
- Payroll status change notifications (HR team)
- Leave approval/rejection notifications (employees)
- Consider: Next.js Route Handlers + `ReadableStream` for SSE

### File Uploads

- Employee profile photos
- Receipt uploads for expense records
- Requires storage integration (Vercel Blob, Cloudflare R2, or S3)

### Recruitment Pipeline (Extended)

- Applicant tracking with stage management
- Interview scheduling
- Offer letter generation (PDF)
- Integration with job boards

---

## Known Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| Finance modules use static data | High | No backend API for doanhthu, chiphi, etc. |
| Seed.ts missing production guard | High | Add `if (NODE_ENV === "production") throw` |
| Migration history drift | High | `prisma/migrations/` has 3 files; DB schema has drifted due to `prisma db execute` changes. Do NOT run `prisma migrate dev` against live data. Use `prisma db execute` for future incremental changes and update `schema.prisma` manually. |
| `as any` casts in Route Handlers | Medium | Auth.js session type augmentation not fully propagated |
| Personal deduction hardcoded | Medium | Move 11,000,000 to DB config before July 2026 reform |
| No rate limiting on login endpoint | Medium | Implement via hosting WAF or middleware |
| Static dashboard data | Medium | Manager dashboard now live; finance/KPI cards still static |
| Recruitment has no backend | Low | Static data only |
| Reports page has no real export | Low | Catalog exists; actual report generation not implemented |
| No test coverage for Route Handlers | Low | Integration tests needed for API layer |
