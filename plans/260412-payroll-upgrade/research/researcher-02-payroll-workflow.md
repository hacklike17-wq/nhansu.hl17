---
# Research: Payroll Workflow, Audit, Excel Export, Caching, Anomaly Detection
**For:** Payroll Upgrade — Phases 7–10
**Date:** 2026-04-12
---

## 1. Excel Export

**Recommendation: `exceljs`**

| Library | Size | Streaming | Formatting | Status |
|---------|------|-----------|------------|--------|
| **exceljs** | ~2MB | ✓ | Rich (styles, charts) | Active |
| SheetJS | ~1MB | Partial | Basic | Stale (vuln in public v18.5+) |

ExcelJS works in Vercel Node runtime. Stream large payrolls:

```typescript
// src/app/api/export/payroll/route.ts
import ExcelJS from 'exceljs'

export async function GET(req: Request) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Bảng lương')
  ws.columns = [
    { header: 'Nhân viên', key: 'name', width: 25 },
    { header: 'Lương cơ bản', key: 'baseSalary', width: 15 },
    { header: 'Thực nhận', key: 'netSalary', width: 15 },
  ]
  // ... add rows
  const buffer = await wb.xlsx.writeBuffer()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bang-luong.xlsx"',
    }
  })
}
```

Install: `npm install exceljs`

---

## 2. Audit Trail Pattern (Prisma)

Store `oldData`/`newData` JSON snapshots in `AuditLog`. **Extend existing schema:**

```prisma
model AuditLog {
  // existing fields...
  oldData    Json?     // snapshot before change
  newData    Json?     // snapshot after change
  changedAt  DateTime  @default(now())
}
```

Pattern in Server Actions:
```typescript
await db.$transaction(async (tx) => {
  const old = await tx.payroll.findUnique({ where: { id } })
  await tx.payroll.update({ where: { id }, data: { status: 'APPROVED' } })
  await tx.auditLog.create({
    data: {
      entityType: 'Payroll', entityId: id,
      action: 'APPROVED',
      oldData: old as unknown as Prisma.JsonObject,
      newData: { status: 'APPROVED', approvedAt: new Date() },
      changedBy: session.user.id,
      companyId,
    }
  })
})
```

No additional packages needed — native Prisma `Json` field.

---

## 3. DB-Level Payroll Caching

**Recommendation: DB cache column on Payroll + Next.js `"use cache"` tag**

- Store computed `netSalary`, `grossSalary` directly on `Payroll` row (already done in schema)
- Skip recalculation if `Payroll.status !== DRAFT` (approved/locked = immutable)
- For DRAFT: recalculate on `generateMonthlyPayroll()` call
- Use `revalidateTag('payroll-{companyId}-{month}')` after recalc

No separate cache table needed at current scale. Redis/materialized views = premature optimization.

---

## 4. Anomaly Detection Rules

Implement as Zod refinements + business rule checks before state transition:

```typescript
const PAYROLL_ANOMALIES = [
  { check: (p) => p.netSalary < 0,         msg: 'Lương thực nhận âm',           severity: 'error' },
  { check: (p) => p.congSoNhan > 31,        msg: 'Công số > 31 ngày',             severity: 'error' },
  { check: (p) => p.grossSalary === 0,      msg: 'Lương gross = 0',               severity: 'warning' },
  { check: (p) => p.pitTax > p.grossSalary, msg: 'Thuế > lương gross',            severity: 'error' },
  { check: (p, prev) =>
      prev && Math.abs(p.netSalary - prev.netSalary) / prev.netSalary > 0.3,
                                             msg: 'Lương thay đổi >30% so tháng trước', severity: 'warning' },
]
```

Run before `DRAFT → PENDING` transition. Block on `error`, warn on `warning`.

---

## 5. SalaryColumn Versioning

**Recommendation: Add `effectiveFrom` field to `SalaryColumn`**

```prisma
model SalaryColumnVersion {
  id              String   @id @default(cuid())
  companyId       String
  columnKey       String
  name            String
  formula         String?
  effectiveFrom   DateTime @db.Date  // first month this version applies
  createdAt       DateTime @default(now())
  createdBy       String?

  @@index([companyId, columnKey, effectiveFrom])
}
```

When calculating payroll for month M: fetch `SalaryColumnVersion` where `effectiveFrom <= M`, order desc, take first.

Current `SalaryColumn` = "current live config". Versions = historical snapshots.

**Migration:** On first save of column formula, create version. On update, create new version (don't mutate old).

---

## Gaps in Current Schema vs. Target

| Gap | Impact | Fix |
|-----|--------|-----|
| `PayrollStatus` missing `LOCKED` | Can't enforce immutability | Add enum value |
| `AuditLog` missing `oldData`/`newData` | Can't show before/after | Add `Json?` fields |
| No `SalaryColumnVersion` table | Can't recalc historical months | Add model |
| `Payroll` has no anomaly flags | Can't surface warnings in UI | Add `anomalies Json?` |
| `SalaryColumn.formula` allows null | Breaks formula engine | Add DB constraint or app guard |
