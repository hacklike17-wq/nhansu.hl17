# Payroll Upgrade Plan — nhansu.hl17

**Date:** 2026-04-12
**Status:** In Planning
**Parent plan:** `plans/260412-production-migration/plan.md`
**Prerequisite:** Production Migration Phases 1–3 must complete before any phase here is implemented.

---

## Overview

Extend the production-ready HR system with a complete, auditable payroll engine:
safe formula evaluation, configurable salary columns, manual inputs, workflow states,
versioning, Excel export, and multi-company RBAC hardening.

---

## Phase Table

| # | Phase | File | Priority | Complexity | Status |
|---|-------|------|----------|------------|--------|
| 1 | Formula Engine | `phase-01-formula-engine.md` | Critical | M | Pending |
| 1b | **Formula Safety Contract** | `phase-01b-formula-safety.md` | **Critical** | S | Pending |
| 2 | Salary Config UI | `phase-02-salary-config-ui.md` | Critical | M | Pending |
| 3 | Data Sync | `phase-03-data-sync.md` | Critical | M | Pending |
| 3b | **Recompute Strategy** | `phase-03b-recompute-strategy.md` | **Critical** | S | Pending |
| 4 | Attendance & Payroll CRUD | `phase-04-attendance-payroll-crud.md` | High | M | Pending |
| 5 | Manual Inputs in Payroll | `phase-05-manual-inputs.md` | High | S | Pending |
| 6 | System Standardization | `phase-06-system-standardization.md` | High | S | Pending |
| 7 | Workflow & Audit | `phase-07-workflow-audit.md` | High | M | Pending |
| 7b | **Payroll Snapshot** | `phase-07b-payroll-snapshot.md` | **Critical** | S | Pending |
| 8 | Versioning & Testing | `phase-08-versioning-testing.md` | Medium | L | Pending |
| 9 | Optimization & Export | `phase-09-optimization-export.md` | Medium | M | Pending |
| 10 | SaaS Expansion | `phase-10-saas-expansion.md` | Low | S | Pending |

**Implementation order:** 1 → 1b → 2 → 3 → 3b → 4 → 5 → 6 → 7 → 7b → 8 → 9 → 10

---

## Dependency Chain

```
Phase 1  (safe formula eval)           → Phase 1b (error contract + cascade safety)
Phase 1b (formula safety contract)     → Phase 2  (validation on save)
Phase 2  (validated columns)           → Phase 3  (sync uses correct column order)
Phase 3  (attendance → recalc)         → Phase 3b (config change → recalc)
Phase 3b (recompute strategy complete) → Phase 4  (CRUD triggers sync)
Phase 4  (employee in month)           → Phase 5  (manual inputs per employee)
Phase 5  (manual inputs)               → Phase 6  (single source of truth)
Phase 6  (standardized vars)           → Phase 7  (workflow on stable calc)
Phase 7  (LOCKED status)               → Phase 7b (snapshot at lock time)
Phase 7b (payroll snapshot)            → Phase 8  (versioning + formulaVersionId in snapshot)
Phase 8  (tests pass)                  → Phase 9  (anomaly + export on stable base)
Phase 9  (anomalies stored)            → Phase 10 (multi-company audit)
```

---

## Schema Changes Required

| Change | Phase |
|--------|-------|
| Add `LOCKED` to `PayrollStatus` | 7 |
| Add `oldData Json?` + `newData Json?` to `AuditLog` | 7 |
| Add `needsRecalc Boolean @default(false)` to `Payroll` | 3b |
| Add `snapshot Json?` to `Payroll` | 7b |
| Add `SalaryColumnVersion` model | 8 |
| Add `anomalies Json?` to `Payroll` | 9 |

---

## Research References

- `research/researcher-01-formula-engine.md`
- `research/researcher-02-payroll-workflow.md`
