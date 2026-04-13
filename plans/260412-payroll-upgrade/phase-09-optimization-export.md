# Phase 09 — Optimization & Export

**Parent:** `plan.md`
**Dependencies:** Phase 07 (workflow states), Phase 08 (tests pass)
**Research refs:** `research/researcher-02-payroll-workflow.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Add payroll anomaly detection (flag impossible/suspicious values before approval), Excel export of monthly payroll, and basic performance optimization using Next.js `"use cache"` for the payroll list view.
- **Priority:** Medium
- **Complexity:** M
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Anomaly detection is deterministic rule-based — no ML needed. Run before DRAFT→PENDING transition to surface problems early.
- Anomalies stored in `Payroll.anomalies Json?` field (added via migration) so they're visible without rechecking.
- Two severity levels: `error` (must fix before sending to pending) and `warning` (show but allow proceed).
- Excel export via `exceljs` in a Route Handler (`GET /api/export/payroll`). ExcelJS is the correct choice (active maintenance, streaming, rich formatting, Vercel Node runtime compatible). SheetJS avoided due to vulnerability in public npm version.
- Cache: payroll list for a month changes rarely once LOCKED. Use `"use cache"` tag on the list query inside `/luong/page.tsx`.
- Do NOT cache DRAFT payrolls (they change frequently). Only cache when all payrolls in month are LOCKED or PAID.

---

## Requirements

### Anomaly Detection

1. New function `checkPayrollAnomalies(payroll, prevMonthPayroll?)` returns `Anomaly[]`.
2. Rules:
   - `netSalary < 0` → error: "Lương thực nhận âm"
   - `congSoNhan > 31` → error: "Công số nhận vượt quá 31 ngày"
   - `pitTax > grossSalary` → error: "Thuế PIT lớn hơn lương gross"
   - `grossSalary === 0 && congSoNhan > 0` → warning: "Lương gross = 0 dù có công số"
   - `prevMonth && Math.abs(netSalary - prevMonth.netSalary) / prevMonth.netSalary > 0.3` → warning: "Lương thay đổi >30% so tháng trước"
3. `anomalies Json?` field added to `Payroll` — populated during `calculatePayroll()`.
4. `toPending()` Server Action: if any `error`-level anomaly exists → block transition + return errors.
5. UI: anomaly warning icons shown in PayrollTable per row; expand to show details.

### Excel Export

6. `GET /api/export/payroll?month=YYYY-MM` → downloads `.xlsx` file.
7. Columns: Mã NV, Họ tên, Phòng ban, Lương CB, Công số, Gross, BHXH, BHYT, BHTN, Thuế, Thực nhận, Trạng thái.
8. Requires `luong.export` permission (add to permission matrix).
9. File name: `bang-luong-YYYY-MM.xlsx`.
10. Style: header row bold + blue background; number cells right-aligned; currency formatted as VND thousands.

### Cache

11. `"use cache"` on payroll list query — tag: `payroll-{companyId}-{month}`.
12. Only add cache if majority of rows are LOCKED/PAID; for DRAFT-heavy months, cache provides little benefit but risks stale display.
13. `revalidateTag` already called after all mutations — cache invalidation is covered.

---

## Architecture

### Schema change (migration)

```prisma
model Payroll {
  // ... existing fields ...
  anomalies Json?   // ← NEW: Array<{ rule: string; severity: 'error'|'warning'; message: string }>
}
```

### Anomaly detection function

```typescript
// src/lib/services/payroll.service.ts

interface Anomaly {
  rule: string
  severity: 'error' | 'warning'
  message: string
}

export function checkPayrollAnomalies(
  payroll: { netSalary: number; congSoNhan: number; grossSalary: number; pitTax: number },
  prev?: { netSalary: number } | null,
): Anomaly[] {
  const anomalies: Anomaly[] = []

  if (payroll.netSalary < 0)
    anomalies.push({ rule: 'NEGATIVE_NET', severity: 'error', message: 'Lương thực nhận âm' })

  if (payroll.congSoNhan > 31)
    anomalies.push({ rule: 'EXCESS_ATTENDANCE', severity: 'error', message: 'Công số nhận vượt quá 31 ngày' })

  if (payroll.pitTax > payroll.grossSalary)
    anomalies.push({ rule: 'TAX_EXCEEDS_GROSS', severity: 'error', message: 'Thuế PIT lớn hơn lương gross' })

  if (payroll.grossSalary === 0 && payroll.congSoNhan > 0)
    anomalies.push({ rule: 'ZERO_GROSS_WITH_ATTENDANCE', severity: 'warning', message: 'Lương gross = 0 dù có công số' })

  if (prev && prev.netSalary > 0) {
    const change = Math.abs(payroll.netSalary - prev.netSalary) / prev.netSalary
    if (change > 0.3)
      anomalies.push({ rule: 'LARGE_CHANGE', severity: 'warning', message: `Lương thay đổi ${Math.round(change * 100)}% so tháng trước` })
  }

  return anomalies
}
```

### Integrate into calculatePayroll

```typescript
// After computing netSalary:
const prevPayroll = await db.payroll.findFirst({
  where: { employeeId, month: subMonths(startOfMonth(month), 1) },
  select: { netSalary: true },
})

const anomalies = checkPayrollAnomalies(
  { netSalary: Number(netSalary), congSoNhan, grossSalary: Number(grossSalary), pitTax: Number(pitTax) },
  prevPayroll ? { netSalary: Number(prevPayroll.netSalary) } : null,
)

// Store in Payroll row
// upsert: { data: { ...existingFields, anomalies: anomalies as unknown as Prisma.JsonArray } }
```

### toPending guard

```typescript
// luong/actions.ts:toPending
const payroll = await db.payroll.findFirst({ where: { id: payrollId } })
const anomalyList = (payroll?.anomalies as Anomaly[] | null) ?? []
const errors = anomalyList.filter(a => a.severity === 'error')
if (errors.length > 0) {
  return { ok: false, error: errors.map(e => e.message).join('; ') }
}
```

### Excel export Route Handler

```typescript
// src/app/api/export/payroll/route.ts
import ExcelJS from 'exceljs'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return unauthorized()
  if (!hasPermission(session.user.permissions, 'luong.export')) return forbidden()

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') // 'YYYY-MM'
  if (!month) return err('month required', 400)

  const companyId = session.user.companyId!
  const monthDate = new Date(`${month}-01`)

  const payrolls = await db.payroll.findMany({
    where: { companyId, month: startOfMonth(monthDate) },
    include: { employee: { select: { code: true, fullName: true, department: true } } },
    orderBy: { employee: { department: 'asc' } },
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`Lương ${month}`)

  // Header row
  ws.columns = [
    { header: 'Mã NV',      key: 'code',       width: 10 },
    { header: 'Họ tên',     key: 'name',        width: 25 },
    { header: 'Phòng ban',  key: 'dept',        width: 15 },
    { header: 'Lương CB',   key: 'base',        width: 14 },
    { header: 'Công số',    key: 'workUnits',   width: 10 },
    { header: 'Gross',      key: 'gross',       width: 14 },
    { header: 'BHXH NV',    key: 'bhxh',        width: 12 },
    { header: 'BHYT NV',    key: 'bhyt',        width: 12 },
    { header: 'BHTN NV',    key: 'bhtn',        width: 12 },
    { header: 'Thuế TNCN',  key: 'pit',         width: 12 },
    { header: 'Thực nhận',  key: 'net',         width: 14 },
    { header: 'Trạng thái', key: 'status',      width: 14 },
  ]

  // Style header
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    cell.alignment = { horizontal: 'center' }
  })

  // Data rows
  const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Nháp', PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt',
    LOCKED: 'Đã khóa', PAID: 'Đã trả',
  }

  for (const p of payrolls) {
    ws.addRow({
      code: p.employee.code ?? '',
      name: p.employee.fullName,
      dept: p.employee.department,
      base: Number(p.baseSalary),
      workUnits: Number(p.netWorkUnits),
      gross: Number(p.grossSalary),
      bhxh: Number(p.bhxhEmployee),
      bhyt: Number(p.bhytEmployee),
      bhtn: Number(p.bhtnEmployee),
      pit: Number(p.pitTax),
      net: Number(p.netSalary),
      status: STATUS_LABELS[p.status] ?? p.status,
    })
  }

  // Number format for currency columns
  ;['base','gross','bhxh','bhyt','bhtn','pit','net'].forEach(key => {
    const col = ws.getColumn(key)
    col.numFmt = '#,##0'
    col.alignment = { horizontal: 'right' }
  })

  const buffer = await wb.xlsx.writeBuffer()

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bang-luong-${month}.xlsx"`,
    },
  })
}
```

### Cache in /luong/page.tsx

```typescript
// luong/page.tsx — wrap fetch in cached function
async function getPayrollList(companyId: string, month: string) {
  'use cache'
  cacheTag(`payroll-${companyId}-${month}`)
  cacheLife('minutes')  // short TTL for DRAFT-heavy months
  return payrollService.listByMonth(companyId, new Date(`${month}-01`))
}
```

### UI changes

```tsx
// PayrollTable.tsx — anomaly icon per row
{row.anomalies?.filter(a => a.severity === 'error').length > 0 && (
  <span title={row.anomalies.map(a => a.message).join('\n')}
    className="text-red-500 cursor-help">⚠</span>
)}
{row.anomalies?.filter(a => a.severity === 'warning').length > 0 && (
  <span title={...} className="text-amber-500 cursor-help">⚠</span>
)}

// "Xuất Excel" button
<a href={`/api/export/payroll?month=${month}`}
   className="px-3 py-1.5 text-sm bg-green-600 text-white rounded">
  Xuất Excel
</a>
```

---

## Related Code Files

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | Modify | Add anomalies Json? to Payroll |
| `prisma/migrations/` | Create | Migration for anomalies field |
| `src/lib/services/payroll.service.ts` | Modify | Add checkPayrollAnomalies(), integrate into calculatePayroll |
| `src/app/luong/actions.ts` | Modify | toPending: block on error anomalies |
| `src/app/luong/components/PayrollTable.tsx` | Modify | Anomaly icons + "Xuất Excel" button |
| `src/app/api/export/payroll/route.ts` | Modify | Full ExcelJS implementation |
| `src/app/luong/page.tsx` | Modify | Add "use cache" with cacheTag |
| `package.json` | Modify | Add exceljs dependency |

---

## Implementation Steps

1. Add `anomalies Json?` to `Payroll` in `schema.prisma`. Run migration.
2. Install ExcelJS: `npm install exceljs`.
3. Write `checkPayrollAnomalies()` in `payroll.service.ts`.
4. Integrate anomaly check into `calculatePayroll()` — store result in `Payroll.anomalies`.
5. Update `toPending()` Server Action: check for error-level anomalies before transition.
6. Implement `GET /api/export/payroll/route.ts` with ExcelJS (see pseudocode).
7. Add `luong.export` to permission matrix in `src/constants/data.ts`.
8. Update `PayrollTable.tsx`: render anomaly icons, "Xuất Excel" link button.
9. Add `"use cache"` wrapper in `luong/page.tsx` with `cacheTag` + `cacheLife('minutes')`.
10. Test: trigger anomaly (set netSalary = -1 manually) → toPending blocked with error message.

---

## Todo List

- [ ] Add anomalies Json? to Payroll model
- [ ] Run migration
- [ ] Install exceljs
- [ ] Write checkPayrollAnomalies()
- [ ] Integrate into calculatePayroll()
- [ ] Update toPending: block on error anomalies
- [ ] Implement Excel export route handler
- [ ] Add luong.export permission
- [ ] Add anomaly icons to PayrollTable
- [ ] Add "Xuất Excel" button
- [ ] Add "use cache" to luong page
- [ ] Test: error anomaly blocks toPending
- [ ] Test: Excel file downloads with correct data

---

## Success Criteria

- Employee with `congSoNhan = 35` → calculatePayroll stores `{ rule: 'EXCESS_ATTENDANCE', severity: 'error', ... }` in anomalies.
- Calling `toPending()` for that employee returns error listing anomaly message.
- "Xuất Excel" button downloads `.xlsx` file with all employees, correct headers, VND numbers.
- Month where salary changed >30% from previous → warning icon appears in PayrollTable row.
- `"use cache"` in place — subsequent page loads within TTL skip DB query.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ExcelJS bundle size increases serverless cold start | Low | Low | ExcelJS is Node-only — not in client bundle |
| anomalies field null for old Payroll rows | Medium | Low | Treat null as empty array in UI + toPending check |
| Cache serves stale DRAFT data after attendance change | Low | Medium | revalidateTag after every mutation — cache invalidated |

---

## Security Considerations

- `luong.export` permission required for Excel download — add to permission matrix.
- Export route: `companyId` from session, not from query string.
- Excel file contains sensitive salary data — no public caching (no CDN cache headers).

---

## Next Steps

Phase 10 audits RBAC granularity and multi-company data isolation.
