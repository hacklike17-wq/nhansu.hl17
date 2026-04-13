# Phase 05 — Finance Modules: Revenue, Expense, Cashflow, Budget, Debt

**Parent:** `plan.md`
**Dependencies:** Phase 01 (schema), Phase 02 (auth), Phase 03 (API pattern), Phase 07 partial (seed)
**Research refs:** `research/researcher-02-schema-design.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Migrate five finance modules from constants/mock data to DB-backed Server Components. Routes: `/doanhthu`, `/chiphi`, `/dongtien`, `/ngansach`, `/congno`.
- **Priority:** High
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Cashflow (`/dongtien`) in current app is a derived view — it interleaves RevenueRecord and ExpenseRecord rows sorted by date. No separate CashflowItem table needed; the service computes cashflow on the fly from existing tables.
- All finance amounts are `Decimal @db.Numeric(15,0)` — when returning to client, convert to `Number` for JSON serialization (Prisma Decimal is not JSON-serializable by default).
- Budget vs Actual is a computed join: `BudgetRecord.actual` should be auto-derived from ExpenseRecord aggregation by category + period, OR maintained as a denormalized field updated by triggers. Recommendation: recompute on read in the service (simpler, no trigger needed at current scale).
- Debt records have a `paid` / `remaining` dynamic — these are computed from payment history OR stored as denormalized fields. Given current app simplicity: store `amount` + `paid` as editable fields; `remaining` is computed.
- Finance modules are predominantly read-heavy with infrequent writes — `"use cache"` with monthly cache tags is appropriate here (e.g., `cacheTag("revenue-2026-04-${companyId}")`).
- Role scoping: `accountant` has full finance access; `hr_manager` has read-only; `employee` has no access (enforced by middleware RBAC).

---

## Requirements

### Revenue (/doanhthu)
- List RevenueRecord by date range; Server Component
- Create/edit/delete: Server Actions (requires `doanhthu.edit`)
- Filter by category, date, customer
- Summary stats: total by category for selected period

### Expense (/chiphi)
- List ExpenseRecord; Server Component
- Create expense: Server Action (status=PENDING)
- Approve expense: Server Action (requires `chiphi.approve`)
- Filter by department, category, status

### Cashflow (/dongtien)
- **Derived view (đã chốt):** merge RevenueRecord + ExpenseRecord, sorted by date. Không có CashflowItem table riêng.
- Running balance computed in service (cumulative sum)
- **Pagination bắt buộc:** default 50 rows/page via `take`/`skip` + tổng số rows để render phân trang. Query có index trên `[companyId, date]`.
- **Cache với tag:** `cacheTag(\`cashflow-${companyId}-${month}\`)` + `cacheLife("hours")`. `revalidateTag` được gọi trong cả revenue và expense Server Actions sau mỗi write.
- No mutations — read-only aggregate view

### Budget (/ngansach)
- BudgetRecord CRUD: Server Actions (requires `ngansach.edit`)
- **Actual column (đã chốt — compute on read):** `financeService.listBudget()` dùng `db.expenseRecord.groupBy()` mỗi lần đọc. `BudgetRecord.actual` **không** là field lưu trong DB — tránh sync bug.
- Nếu volume expense tăng đáng kể trong tương lai: bổ sung cron/trigger cập nhật materialized field, không cần thay đổi API interface.
- Variance + percentage calculated in service

### Debt (/congno)
- DebtRecord CRUD: Server Actions
- Filter by type (receivable/payable), status, overdue
- Days overdue computed from `dueDate` vs today in service

---

## Architecture

### File structure

```
src/
  app/
    doanhthu/
      page.tsx              ← Server Component
      actions.ts
      components/
        RevenueTable.tsx    ← 'use client'
        RevenueModal.tsx    ← 'use client'

    chiphi/
      page.tsx
      actions.ts
      components/
        ExpenseTable.tsx
        ExpenseModal.tsx
        ExpenseApprovalActions.tsx

    dongtien/
      page.tsx              ← Server Component, read-only
      components/
        CashflowTable.tsx   ← 'use client' (filter state)

    ngansach/
      page.tsx
      actions.ts
      components/
        BudgetTable.tsx
        BudgetModal.tsx

    congno/
      page.tsx
      actions.ts
      components/
        DebtTable.tsx
        DebtModal.tsx

  services/
    finance.service.ts      ← all 5 finance modules in one file (small services)

  lib/
    schemas/
      finance.ts            ← Zod schemas for all finance records
```

### finance.service.ts key functions

```typescript
export const financeService = {
  // Revenue
  async listRevenue(companyId: string, filters: RevenueFilters) {
    return db.revenueRecord.findMany({
      where: { companyId, ...buildDateFilter(filters), ...buildCategoryFilter(filters) },
      orderBy: { date: "desc" },
    })
  },

  async createRevenue(companyId: string, data: CreateRevenueInput) {
    return db.revenueRecord.create({ data: { ...data, companyId } })
  },

  // Expense
  async listExpense(companyId: string, filters: ExpenseFilters) { ... },
  async approveExpense(companyId: string, id: string, approverId: string) {
    return db.$transaction([
      db.expenseRecord.update({ where: { id, companyId }, data: { status: "APPROVED", approvedBy: approverId } }),
      db.auditLog.create({ data: { companyId, entityType: "ExpenseRecord", entityId: id, action: "APPROVE", changedBy: approverId } }),
    ])
  },

  // Cashflow — derived view với pagination
  async getCashflow(companyId: string, dateRange: { from: Date; to: Date }, page = 1, pageSize = 50) {
    const [revenues, expenses] = await Promise.all([
      db.revenueRecord.findMany({ where: { companyId, date: { gte: dateRange.from, lte: dateRange.to } }, orderBy: { date: "asc" } }),
      db.expenseRecord.findMany({ where: { companyId, status: "APPROVED", date: { gte: dateRange.from, lte: dateRange.to } }, orderBy: { date: "asc" } }),
    ])
    const allItems = [
      ...revenues.map(r => ({ ...r, type: "in" as const, rawAmount: Number(r.amount) })),
      ...expenses.map(e => ({ ...e, type: "out" as const, rawAmount: -Number(e.amount) })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Tính running balance trên toàn bộ trước khi paginate
    let balance = 0
    const withBalance = allItems.map(item => {
      balance += item.rawAmount
      return { ...item, balance }
    })

    const total = withBalance.length
    const paginated = withBalance.slice((page - 1) * pageSize, page * pageSize)
    return { items: paginated, total, page, pageSize }
  },

  // Budget — actual = sum of approved expenses for period + category
  async listBudget(companyId: string, period: Date) {
    const budgets = await db.budgetRecord.findMany({ where: { companyId, period } })
    const actuals = await db.expenseRecord.groupBy({
      by: ["category", "department"],
      where: { companyId, status: "APPROVED", date: { gte: startOfMonth(period), lte: endOfMonth(period) } },
      _sum: { amount: true },
    })
    return budgets.map(b => ({
      ...b,
      actual: Number(actuals.find(a => a.category === b.category && a.department === b.department)?._sum.amount ?? 0),
    }))
  },

  // Debt
  async listDebt(companyId: string) {
    const debts = await db.debtRecord.findMany({ where: { companyId }, orderBy: { dueDate: "asc" } })
    return debts.map(d => ({
      ...d,
      amount: Number(d.amount),
      daysOverdue: d.dueDate < new Date() && !d.isPaidOff ? differenceInDays(new Date(), d.dueDate) : 0,
    }))
  },
}
```

### Decimal serialization helper

```typescript
// src/lib/decimal.ts
import { Prisma } from "@prisma/client"

export function serializeDecimal<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, v) =>
    v instanceof Prisma.Decimal ? Number(v) : v
  ))
}
```

Call `serializeDecimal()` in service layer before returning to page/action callers.

### Caching example (cashflow)

```typescript
// In dongtien/page.tsx
"use cache"
import { cacheTag, cacheLife } from "next/cache"

async function getCachedCashflow(companyId: string, month: string) {
  "use cache"
  cacheTag(`cashflow-${companyId}-${month}`)
  cacheLife("hours")
  return financeService.getCashflow(companyId, monthToDateRange(month))
}
// Invalidate on new revenue/expense creation:
revalidateTag(`cashflow-${companyId}-${month}`)
```

---

## Related Code Files

**Current files that will change:**
- `src/app/doanhthu/page.tsx`
- `src/app/chiphi/page.tsx`
- `src/app/dongtien/page.tsx`
- `src/app/ngansach/page.tsx`
- `src/app/congno/page.tsx`

**New files:**
- `src/app/doanhthu/actions.ts` + `components/`
- `src/app/chiphi/actions.ts` + `components/`
- `src/app/dongtien/components/CashflowTable.tsx`
- `src/app/ngansach/actions.ts` + `components/`
- `src/app/congno/actions.ts` + `components/`
- `src/services/finance.service.ts`
- `src/lib/schemas/finance.ts`
- `src/lib/decimal.ts`

---

## Implementation Steps

1. Write `src/lib/decimal.ts` (Decimal serializer — needed across all finance modules)
2. Write `src/lib/schemas/finance.ts` Zod schemas for all 5 models
3. Implement `financeService` — all functions in one file
4. Convert `/doanhthu/page.tsx` to Server Component; extract `RevenueTable` + `RevenueModal` client components; write `actions.ts`
5. Convert `/chiphi/page.tsx`; add expense approval Server Action with AuditLog
6. Convert `/dongtien/page.tsx` — read-only; extract CashflowTable client component (filter state); apply `"use cache"` on data fetcher
7. Convert `/ngansach/page.tsx`; ensure actual column computed from ExpenseRecord groupBy
8. Convert `/congno/page.tsx`; compute `daysOverdue` in service; add overdue highlight in table
9. Add route handlers for any finance endpoints needed (e.g., export)
10. Validate: cashflow balance matches sum of revenues minus approved expenses for test month

---

## Todo List

- [ ] Write src/lib/decimal.ts
- [ ] Write finance Zod schemas
- [ ] Implement financeService (revenue, expense, cashflow, budget, debt)
- [ ] Convert /doanhthu — Server Component + actions
- [ ] Convert /chiphi — Server Component + approval action + AuditLog
- [ ] Convert /dongtien — read-only Server Component + caching (cacheTag per companyId+month) + pagination (50/page)
- [ ] Verify revalidateTag("cashflow-*") được gọi trong revenue + expense Server Actions
- [ ] Convert /ngansach — Server Component + computed actual (groupBy, không lưu vào DB)
- [ ] Convert /congno — Server Component + daysOverdue computation
- [ ] Test cashflow running balance
- [ ] Test budget actual matches expense aggregation
- [ ] Verify Decimal serialization (no JSON errors)

---

## Success Criteria

- All 5 finance pages load data from DB
- Cashflow pagination: page 1 trả 50 rows, page 2 trả rows 51-100, running balance liên tục giữa các trang
- revalidateTag cashflow được trigger sau khi tạo revenue/expense mới
- Budget "actual" bằng đúng tổng approved expenses khi groupBy category+period
- BudgetRecord.actual không tồn tại trong DB schema (compute-only field)
- Debt days overdue computed at render time, not stored
- Expense approval writes AuditLog row
- No Prisma Decimal serialization errors in JSON responses

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Decimal JSON serialization error | High | High | Apply serializeDecimal() consistently in service return values |
| Cashflow performance on large date range | Medium | Low | Add DB index on `[companyId, date]` (already in schema); paginate if needed |
| Budget actual drift (groupBy vs stored) | Low | Medium | Keep actual computed, never stored — eliminates sync bugs |

---

## Security Considerations

- Finance data is sensitive — double-check that `employee` role is blocked at middleware level (`ROUTE_PERMISSION` entries for all finance routes)
- Expense approval: verify `chiphi.approve` permission in Server Action, not just middleware
- Never expose raw DB aggregates without companyId filter

---

## Next Steps

Phase 06 (Admin Modules) covers Settings (CompanySettings, SystemConfig) and Permissions (PermissionGroup CRUD). Finance modules feed into Settings for tax config.
