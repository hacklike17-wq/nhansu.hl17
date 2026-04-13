# Phase 03 — Công số trừ (/nghiphep)

**Parent plan:** [plan.md](./plan.md)
**Dependencies:** Phase 01 (DeductionEvent type + AuthProvider deductions state)
**Date:** 2026-04-12
**Priority:** High
**Status:** pending

---

## Overview

Redesign `/nghiphep` from a leave-request list to a "Công số trừ" event log. Three event types: nghỉ ngày (-1.0), đi muộn (-0.25), OT (+0.25). Employee submits events → Admin/HR approves. Month view with totals. Data in `hl17_deductions` via AuthProvider context.

---

## Key Insights

- Existing page uses `LEAVE_DATA` (static). Full replacement with `deductions` from context.
- Three event types map to fixed `delta` values — no free-form delta input for employee submissions.
- OT (+0.25) is a positive adjustment — it reduces the "công số trừ" net deduction (or adds to công số nhận conceptually). Net for month = sum of all deltas.
- Approval flow: employees see own records + status badge; Admin/HR see all + approve/reject buttons.
- "Tổng công số trừ tháng" stat is critical — used by Phase 04 (luong) for salary calculation.
- `status: 'pending'` events are NOT counted in salary calc (only `approved` events count).

---

## Requirements

1. Remove `LEAVE_DATA` import; read `deductions` from `useAuth()`
2. Month picker filter (default current month)
3. Employee: submit new DeductionEvent via form modal; sees own records + status
4. Admin/HR: sees all records, approve/reject pending events
5. Stats row: Tổng trừ (sum of approved deltas), Chờ duyệt count, Đã duyệt count, OT count
6. Table columns: Ngày | Nhân viên (admin only) | Loại | Công số | Lý do | Trạng thái | Actions
7. Submit form: date, type (nghỉ ngày / đi muộn / OT), reason
8. Approve/reject: Admin/HR clicks → sets `status`, `approvedBy`, `approvedAt`
9. `setDeductions` for all mutations

---

## Architecture

### Event type map

```ts
const EVENT_TYPE_MAP = {
  nghi_ngay: { label: 'Nghỉ ngày',  delta: -1.0,  cls: 'bg-red-50 text-red-700 border-red-200' },
  di_muon:   { label: 'Đi muộn',   delta: -0.25, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  overtime:  { label: 'OT',         delta: +0.25, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}
```

### Submit flow (employee)

```ts
function submitEvent(form: { date: string; type: DeductionEvent['type']; reason: string }) {
  const event: DeductionEvent = {
    id: `DE-${Date.now()}`,
    employeeId: user!.employeeId,
    employeeName: user!.name,
    date: form.date,
    type: form.type,
    delta: EVENT_TYPE_MAP[form.type].delta,
    reason: form.reason,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  }
  setDeductions(prev => [...prev, event])
}
```

### Approve/reject (admin/hr)

```ts
function updateStatus(id: string, status: 'approved' | 'rejected') {
  setDeductions(prev => prev.map(d =>
    d.id === id
      ? { ...d, status, approvedBy: user!.name, approvedAt: new Date().toISOString() }
      : d
  ))
}
```

### Component structure

```
NghiPhepPage ('use client')
  ├── Stats row (4 cards)
  ├── Toolbar: month picker | search | [+ Nộp đơn] (all roles)
  ├── Table
  │   └── rows: DeductionEvent[] (role-scoped)
  │       └── Approve/Reject buttons (admin/hr, pending only)
  └── SubmitEventModal (conditional)
```

---

## Related Code Files

- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/nghiphep/page.tsx` — full rewrite
- `/Users/hoahenry/Desktop/nhansu.hl17/src/components/auth/AuthProvider.tsx` — source of `deductions`
- `/Users/hoahenry/Desktop/nhansu.hl17/src/types/index.ts` — `DeductionEvent` type

---

## Implementation Steps

1. Open `src/app/nghiphep/page.tsx`
2. Replace `LEAVE_DATA` import with `useAuth()` destructure: `{ user, employees, deductions, setDeductions }`
3. Add `monthFilter` state (default current month)
4. Define `EVENT_TYPE_MAP` constant at top of file
5. Filter logic:
   ```ts
   const filtered = deductions.filter(d => {
     if (isEmployee && d.employeeId !== user?.employeeId) return false
     if (!d.date.startsWith(monthFilter)) return false
     if (search && !d.employeeName.toLowerCase().includes(search.toLowerCase())) return false
     return true
   })
   ```
6. Stats: `netApproved = filtered.filter(d => d.status === 'approved').reduce((s,d) => s + d.delta, 0)`
7. Add month picker + "+ Nộp đơn" button (all roles)
8. Rewrite table with new columns; add approve/reject action column (admin/hr, pending only)
9. Add `SubmitEventModal` inline component (type selector, date, reason)
10. Implement `submitEvent` and `updateStatus` handlers
11. Update `PageShell` title to "Công số trừ"

---

## Todo

- [ ] Replace `LEAVE_DATA` import with `useAuth()` deductions
- [ ] Add `monthFilter` state
- [ ] Define `EVENT_TYPE_MAP`
- [ ] Update filter logic
- [ ] Rewrite stats (net trừ, chờ duyệt, đã duyệt, OT count)
- [ ] Add month picker to toolbar
- [ ] Rewrite table columns for DeductionEvent schema
- [ ] Add approve/reject buttons for admin/hr
- [ ] Add `SubmitEventModal`
- [ ] Implement `submitEvent` → `setDeductions`
- [ ] Implement `updateStatus` → `setDeductions`
- [ ] Update page title to "Công số trừ"

---

## Success Criteria

- Employee can submit event → appears in table with "Chờ duyệt" status
- Admin can approve → status changes to "Đã duyệt"
- Net công số trừ stat only counts approved events
- Month filter correctly scopes data
- No TypeScript errors

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Employee submits multiple events same day | Low | Allow; total is summed correctly |
| OT event increases net delta (positive) — confusing label "công số trừ" | Medium | Show OT as separate stat card; clarify in UI label |

---

## Security Considerations

- Employee can only submit for themselves (hardcoded `user.employeeId`)
- Approve action gated by role check in render (`!isEmployee`)

---

## Next Steps

→ Phase 04: `/luong` reads both attendance and approved deductions to calculate net pay
