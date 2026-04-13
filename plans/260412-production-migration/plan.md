# Production Migration Plan — nhansu.hl17

**Date:** 2026-04-12
**Status:** In Planning
**Supersedes:** `plans/260412-modules-redesign/` — that plan targeted localStorage redesign and is now skipped entirely. Implement directly in DB per this plan.

---

## Overview

Migrate from 100% client-side demo (localStorage + mock constants) to full-stack production:
Next.js 16 App Router + PostgreSQL + Prisma + Auth.js v5 + Vercel.

---

## Phase Table

| # | Phase | File | Priority | Status |
|---|-------|------|----------|--------|
| 1 | Foundation — Prisma, DB schema, env setup | `phase-01-foundation.md` | Critical | Pending |
| 2 | Auth System — Auth.js v5, middleware RBAC | `phase-02-auth-system.md` | Critical | Pending |
| 3 | API & Service Layer — Route Handlers, Server Actions, Zod | `phase-03-api-service-layer.md` | Critical | Pending |
| 4 | HR Modules — Employee, Attendance, Leave, Payroll | `phase-04-hr-modules.md` | High | Pending |
| 5 | Finance Modules — Revenue, Expense, Cashflow, Budget, Debt | `phase-05-finance-modules.md` | High | Pending |
| 6 | Admin Modules — Settings, Permissions, Salary config | `phase-06-admin-modules.md` | Medium | Pending |
| 7 | Data Migration — Seed DB, remove localStorage | `phase-07-data-migration.md` | High | Pending |
| 8 | Deployment — Vercel, Neon/Supabase, CI/CD | `phase-08-deployment.md` | Medium | Pending |

**Implementation order:** 1 → 2 → 3 → 7 (partial seed) → 4 → 5 → 6 → 7 (cleanup) → 8

---

## Dependency Chain

```
Phase 1 (schema) → Phase 2 (auth needs User/Session tables)
Phase 2 (auth) → Phase 3 (API layer uses auth())
Phase 3 (API pattern) → Phase 4/5/6 (all modules follow same pattern)
Phase 7 (seed) → must run before Phase 4/5/6 frontend wiring
Phase 4+5+6 → Phase 8 (deploy only when modules stable)
```

---

## Key Architecture Decisions

- Auth.js v5 Credentials + PgAdapter + DB sessions (not JWT)
- `Decimal @db.Numeric(15,0)` for all VND
- Soft delete (`deletedAt`) on Employee only
- PITBracket + InsuranceRate in DB (editable via Settings UI)
- Server Actions for mutations; Route Handlers for REST/export endpoints
- `"use cache"` opt-in per Next.js 16 (dynamic by default)
- PgBouncer connection pooling in production
- Vietnamese route paths preserved: `/nhanvien`, `/chamcong`, `/luong`, etc.

---

## Research References

- `research/researcher-01-nextjs-prisma-auth.md`
- `research/researcher-02-schema-design.md`
