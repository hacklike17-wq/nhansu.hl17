# Phase 07 — Data Migration: Seed DB, Remove localStorage

**Parent:** `plan.md`
**Dependencies:** Phase 01 (schema + migrations), Phase 02 (User model + auth), Phase 03-06 (service layer — seed script uses services or db directly)
**Research refs:** `research/researcher-02-schema-design.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Convert all seed data from `src/constants/data.ts` to a proper Prisma seed script. Remove all localStorage persistence. Remove data array exports from constants/data.ts. This phase has two runs: (1) Partial seed early (after Phase 01) to unblock dev testing; (2) Full cleanup after Phase 04-06 are complete.
- **Priority:** High
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- `src/constants/data.ts` currently exports ~900+ lines of seed data (employees, salary records, attendance, leave, revenue, expense, budget, debt, settings). All data arrays must move to `prisma/seed.ts`.
- After migration, `constants/data.ts` keeps only: `ALL_MODULES`, `ALL_ACTIONS`, `ROUTE_PERMISSION`, `hasPermission()`, `resolvePermissions()`, `NAV_SECTIONS`, `ICON_MAP` references. Everything else is removed.
- Passwords in current mock data are plaintext — the seed script must hash them with bcrypt before inserting User records.
- The `prisma/seed.ts` script must be idempotent — safe to re-run (upsert, not create). Use `prisma db seed` via the `prisma.seed` script in `package.json`.
- localStorage keys (`hl17_user`, `hl17_employees`, etc.) must all be removed from `AuthProvider.tsx` — already planned in Phase 02. This phase ensures no residual `localStorage.setItem/getItem` exists anywhere in the codebase.
- The `AuthProvider.tsx` after Phase 02 has no localStorage — this phase audits and confirms.
- ID format change: current IDs are `E001`, `SAL-001`, etc. Prisma uses `cuid()` by default. Seed script must generate deterministic IDs using `cuid2` with seed, OR use the existing string IDs directly as the Prisma id field (valid since id is `String`).
- Recommendation: keep existing IDs in seed (E001, SAL-001, etc.) for easier cross-reference during development. Switch to cuid() for new records created post-migration.

---

## Requirements

1. `prisma/seed.ts` covers all entities: Company, User (with hashed passwords), PermissionGroup, Employee, WorkUnit, DeductionEvent, LeaveRequest, Payroll (optional — can regenerate via service), RevenueRecord, ExpenseRecord, BudgetRecord, DebtRecord, PITBracket, InsuranceRate, SalaryColumn, CompanySettings, SystemConfig
2. Seed is idempotent (upsert / createOrUpdate)
3. After seed, all pages load data from DB — no fallback to constants arrays
4. `constants/data.ts` slimmed: data arrays removed, utility exports kept
5. No `localStorage.setItem/getItem` remaining in codebase (grep-verified)
6. `.env.local` has `DATABASE_SEED_RESET=true` flag to optionally wipe + reseed in dev

---

## Architecture

### Seed script structure

```
prisma/
  seed.ts                ← main entry point
  seeds/
    01-company.ts
    02-users.ts          ← hashes passwords
    03-permission-groups.ts
    04-employees.ts
    05-pit-brackets.ts
    06-insurance-rates.ts
    07-salary-columns.ts
    08-work-units.ts
    09-deduction-events.ts
    10-leave-requests.ts
    11-revenue.ts
    12-expenses.ts
    13-budget.ts
    14-debt.ts
    15-company-settings.ts
```

### package.json seed configuration

```json
{
  "prisma": {
    "seed": "npx ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

### prisma/seed.ts

```typescript
import { db } from "../src/lib/db"
import { seedCompany } from "./seeds/01-company"
import { seedUsers } from "./seeds/02-users"
// ... all imports

async function main() {
  // PRODUCTION GUARD — không bao giờ seed trên production
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed script không được chạy trên production. Dùng DATABASE_URL_DIRECT + migrate deploy thay thế.")
  }

  console.log("Seeding database...")
  const company = await seedCompany(db)
  await seedPermissionGroups(db, company.id)
  await seedEmployees(db, company.id)
  await seedUsers(db, company.id)        // links User → Employee
  await seedPITBrackets(db, company.id)
  await seedInsuranceRates(db, company.id)
  await seedSalaryColumns(db, company.id)
  await seedWorkUnits(db, company.id)
  await seedDeductionEvents(db, company.id)
  await seedLeaveRequests(db, company.id)
  await seedRevenue(db, company.id)
  await seedExpenses(db, company.id)
  await seedBudget(db, company.id)
  await seedDebt(db, company.id)
  await seedCompanySettings(db, company.id)
  console.log("Seed complete.")
}

main().catch(console.error).finally(() => db.$disconnect())
```

### seeds/02-users.ts (password hashing pattern)

```typescript
import bcrypt from "bcryptjs"
import { EMPLOYEES } from "../../src/constants/data"  // read once during migration, then remove

export async function seedUsers(db: PrismaClient, companyId: string) {
  for (const emp of EMPLOYEES) {
    if (emp.accountStatus === 'no_account') continue
    const hashed = await bcrypt.hash(emp.accountPassword, 12)
    await db.user.upsert({
      where: { email: emp.accountEmail },
      update: {},
      create: {
        email: emp.accountEmail,
        name: emp.name,
        password: hashed,
        role: emp.accountRole,
        companyId,
        employeeId: emp.id,
      },
    })
  }
}
```

### seeds/05-pit-brackets.ts (2025 + 2026 reform)

```typescript
// Vietnamese PIT Brackets — current (valid until July 2026)
const PIT_2025 = [
  { minIncome: 0,         maxIncome: 5_000_000,   rate: 0.05, validFrom: new Date("2020-01-01"), validTo: new Date("2026-06-30") },
  { minIncome: 5_000_000, maxIncome: 10_000_000,  rate: 0.10, validFrom: new Date("2020-01-01"), validTo: new Date("2026-06-30") },
  { minIncome: 10_000_000,maxIncome: 18_000_000,  rate: 0.15, validFrom: new Date("2020-01-01"), validTo: new Date("2026-06-30") },
  { minIncome: 18_000_000,maxIncome: 32_000_000,  rate: 0.20, validFrom: new Date("2020-01-01"), validTo: new Date("2026-06-30") },
  { minIncome: 32_000_000,maxIncome: 52_000_000,  rate: 0.25, validFrom: new Date("2020-01-01"), validTo: new Date("2026-06-30") },
  { minIncome: 52_000_000,maxIncome: 80_000_000,  rate: 0.30, validFrom: new Date("2020-01-01"), validTo: new Date("2026-06-30") },
  { minIncome: 80_000_000,maxIncome: 999_999_999, rate: 0.35, validFrom: new Date("2020-01-01"), validTo: new Date("2026-06-30") },
]

// Note: 5-bracket system from July 2026 — insert as separate rows with validFrom: 2026-07-01
// Updated deduction allowances: personal 15.5M/month, dependent 6.2M/month from July 2026
// These amounts should also be stored as SystemConfig fields, not hardcoded
```

### What stays in constants/data.ts after cleanup

```typescript
// KEEP (UI config, navigation, permission helpers)
export const ALL_MODULES = [ ... ]           // UI: permission matrix rows
export const ALL_ACTIONS = [ ... ]           // UI: permission matrix columns
export const ROUTE_PERMISSION = { ... }      // middleware + ProtectedLayout
export function hasPermission() { ... }      // utility — used in middleware, components
export function resolvePermissions() { ... } // still used if needed
export const NAV_SECTIONS = [ ... ]          // Sidebar navigation config

// REMOVE (data arrays → moved to prisma/seed.ts)
// EMPLOYEES, SALARY_DATA, ATTENDANCE_DATA, LEAVE_DATA,
// REVENUE_DATA, EXPENSE_DATA, BUDGET_DATA, DEBT_DATA,
// DEFAULT_WORK_UNITS, PERMISSION_GROUPS (data), DEPARTMENT_DATA,
// DEFAULT_SALARY_COLUMNS, COMPANY_SETTINGS, SYSTEM_CONFIG
```

### localStorage removal checklist

Files to audit after Phase 02 (confirm no residual localStorage):
- `src/components/auth/AuthProvider.tsx` — all `localStorage.*` removed
- `src/app/login/page.tsx` — no localStorage
- `src/app/**/page.tsx` — grep for `localStorage`
- `src/components/**/*.tsx` — grep for `localStorage`

Run: `grep -r "localStorage" src/` — should return zero results.

---

## Related Code Files

**Modified:**
- `prisma/seed.ts` — created (new)
- `prisma/seeds/*.ts` — created (new)
- `src/constants/data.ts` — data arrays removed; utility exports kept
- `src/components/auth/AuthProvider.tsx` — localStorage removed (done in Phase 02; confirmed here)
- `package.json` — add `prisma.seed` entry

**Files to grep-audit for localStorage removal:**
- All files under `src/`

---

## Implementation Steps

### Run A — Partial seed (after Phase 01, before Phase 04)
1. Write `prisma/seed.ts` with Company + User + PermissionGroup + Employee + PITBracket + InsuranceRate + SalaryColumn seeds
2. Run `npx prisma db seed`
3. Verify: query DB — employees table has correct rows, users have hashed passwords
4. Unblock dev testing of Phase 02-04 against real DB data

### Run B — Full seed + cleanup (after Phase 04-06 complete)
5. Add remaining seed files (revenue, expense, budget, debt, leave, attendance, payroll)
6. Re-run seed: `npx prisma db seed` (idempotent — safe)
7. Audit `src/constants/data.ts` — remove all data array exports
8. Fix all TypeScript import errors from removed exports
9. Run `grep -r "localStorage" src/` — confirm zero matches
10. Run `grep -r "EMPLOYEES\|SALARY_DATA\|ATTENDANCE_DATA\|LEAVE_DATA\|REVENUE_DATA\|EXPENSE_DATA\|BUDGET_DATA\|DEBT_DATA\|DEFAULT_WORK_UNITS" src/` — confirm zero matches
11. Run `npm run build` — confirm no type errors
12. Run `npm run lint` — confirm no lint errors
13. **Smoke test đầy đủ** (xem chi tiết bên dưới)

---

## Todo List

### Run A (after Phase 01)
- [ ] Write prisma/seed.ts entry point
- [ ] Write seeds/01-company.ts
- [ ] Write seeds/02-users.ts (with bcrypt)
- [ ] Write seeds/03-permission-groups.ts
- [ ] Write seeds/04-employees.ts
- [ ] Write seeds/05-pit-brackets.ts (2025 brackets + 2026 reform brackets)
- [ ] Write seeds/06-insurance-rates.ts
- [ ] Write seeds/07-salary-columns.ts
- [ ] Add prisma.seed to package.json
- [ ] Run npx prisma db seed — verify

### Run B (after Phase 04-06)
- [ ] Write seeds/08-work-units.ts
- [ ] Write seeds/09-deduction-events.ts
- [ ] Write seeds/10-leave-requests.ts
- [ ] Write seeds/11-revenue.ts
- [ ] Write seeds/12-expenses.ts
- [ ] Write seeds/13-budget.ts
- [ ] Write seeds/14-debt.ts
- [ ] Write seeds/15-company-settings.ts
- [ ] Re-run full seed
- [ ] Remove data arrays from constants/data.ts
- [ ] Fix all import errors
- [ ] grep confirm: localStorage = 0 results
- [ ] grep confirm: data array imports = 0 results
- [ ] npm run build — clean
- [ ] Full smoke test — chạy toàn bộ checklist bên dưới

---

## Smoke Test Checklist (sau Run B — seed đầy đủ)

### Auth
- [ ] Login với `boss_admin` credentials → redirect về `/`, session cookie set
- [ ] Login với `employee` credentials → redirect về `/`, sidebar chỉ hiện menu được phép
- [ ] Login sai password → error message, không set cookie
- [ ] Đăng xuất → cookie xóa, redirect `/login`

### Phân quyền (RBAC)
- [ ] `employee` role truy cập `/phanquyen` trực tiếp → redirect về `/`
- [ ] `accountant` role truy cập `/nhanvien` → xem được (read-only)
- [ ] `hr_manager` role truy cập `/doanhthu` → redirect về `/` (blocked)

### Approval path — Leave
- [ ] `employee` gửi đơn nghỉ 3 ngày → LeaveRequest PENDING tạo thành công
- [ ] `hr_manager` duyệt đơn → 3 DeductionEvents tạo, đúng leaveRequestId
- [ ] `hr_manager` từ chối đơn khác → không tạo DeductionEvent

### Approval path — Payroll
- [ ] Generate bảng lương tháng cho tất cả nhân viên → Payroll DRAFT tạo
- [ ] Chuyển DRAFT → PENDING → APPROVED → PAID qua từng action
- [ ] Duyệt bảng lương đã APPROVED → nhận lỗi "Đã xử lý"

### Export
- [ ] `/api/export/payroll?month=2026-04` → tải file CSV, mở được, dữ liệu đúng cột

### Finance
- [ ] Tạo revenue record → Cashflow page cập nhật (revalidateTag hoạt động)
- [ ] Budget actual khớp với tổng approved expenses cùng category + tháng

### Build final
- [ ] `grep -r "localStorage" src/` → 0 kết quả
- [ ] `npm run build` → thành công, không có type error
- [ ] `npm run lint` → không có lỗi

---

## Success Criteria

- `npx prisma db seed` completes without errors
- All employees exist in DB with hashed passwords (`$2b$` prefix confirmed)
- Seed guard throws nếu chạy với `NODE_ENV=production`
- Login works with seeded credentials
- All 16 pages load data from DB, not constants
- `grep -r "localStorage" src/` returns empty
- `npm run build` passes
- Toàn bộ smoke test checklist passed

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| bcrypt hashing slow for large seed | Low | Low | ~15 employees — negligible |
| Type errors after removing data array exports | High | Medium | Run build first; fix imports incrementally |
| Seed IDs clash with auto-generated IDs | Medium | Medium | Use upsert by unique field (email, etc.) not by id |
| PIT 2026 brackets wrong values | Medium | High | Cross-reference Acclime Vietnam guide; seeded with validFrom=2026-07-01 |

---

## Security Considerations

- Seed script contains real business logic passwords — only run in controlled environments
- Do not commit seed passwords that match production user passwords
- **Production guard đã thêm vào `seed.ts`:** `if (process.env.NODE_ENV === "production") throw` ở dòng đầu
- After seed: verify no plaintext passwords exist in any DB column (`SELECT password FROM "User" LIMIT 1` phải trả hash bắt đầu bằng `$2b$`)

---

## Next Steps

Phase 08 (Deployment) — once all 16 pages are verified clean, proceed to Vercel + Neon setup.
