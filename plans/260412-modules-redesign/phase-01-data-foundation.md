# Phase 01 — Data Foundation

**Parent plan:** [plan.md](./plan.md)
**Dependencies:** none (this is the foundation)
**Date:** 2026-04-12
**Priority:** Critical
**Status:** pending

---

## Overview

Add two new data types (`WorkUnit`, `DeductionEvent`), wire up two new localStorage keys (`hl17_attendance`, `hl17_deductions`), and extend `AuthProvider` to own/persist these collections. Also add auto-attendance insertion on app load. All subsequent phases depend on this.

---

## Key Insights

- Existing `AttendanceRecord` tracks check-in/check-out times — unsuitable for the new "công số nhận" concept (scalar work units per day). A new, simpler type is needed.
- `AuthProvider` already has a clean pattern for loading/persisting arrays (employees, groups) — replicate for attendance + deductions.
- Auto-attendance must run exactly once per day per employee, guarded against duplicate inserts.
- `DeductionEvent` unifies leave (-1.0), late (-0.25), and OT (+0.25) into a single append-only log; net công số trừ = sum of all events for the month.

---

## Requirements

1. Add type `WorkUnit` to `src/types/index.ts`
2. Add type `DeductionEvent` to `src/types/index.ts`
3. Extend `AuthContextType` with `attendance`, `setAttendance`, `deductions`, `setDeductions`
4. Load `hl17_attendance` and `hl17_deductions` from localStorage on mount
5. Persist both on change (same pattern as `employees`)
6. Auto-attendance: on mount, after loading, if no `WorkUnit` for today + user.employeeId → insert `{ units: 1.0 }`
7. Seed empty arrays `[]` if keys don't exist yet (no seed data in `constants/data.ts`)

---

## Architecture

### New Types

```ts
// WorkUnit — one record per employee per day
export type WorkUnit = {
  id: string             // e.g. "WU-20260412-E001"
  employeeId: string
  employeeName: string
  date: string           // ISO YYYY-MM-DD
  units: number          // default 1.0
  note: string
}

// DeductionEvent — append-only event log
export type DeductionEvent = {
  id: string             // e.g. "DE-001"
  employeeId: string
  employeeName: string
  date: string           // ISO YYYY-MM-DD
  type: 'nghi_ngay' | 'di_muon' | 'overtime'
  delta: number          // -1.0 | -0.25 | +0.25
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  approvedBy?: string
  approvedAt?: string
}
```

### AuthProvider extensions

```ts
// Additional state
const [attendance, setAttendance] = useState<WorkUnit[]>([])
const [deductions, setDeductions] = useState<DeductionEvent[]>([])

// In init useEffect — after loading user:
// Auto-attendance
if (userData) {
  const today = new Date().toISOString().slice(0, 10)
  const already = att.some(a => a.employeeId === userData.employeeId && a.date === today)
  if (!already) {
    const emp = emps.find(e => e.id === userData.employeeId)
    const newUnit: WorkUnit = {
      id: `WU-${today.replace(/-/g,'')}-${userData.employeeId}`,
      employeeId: userData.employeeId,
      employeeName: userData.name,
      date: today,
      units: 1.0,
      note: 'Tự động',
    }
    att = [...att, newUnit]
  }
}

// Persist effects (non-init)
useEffect(() => {
  if (!isLoading) localStorage.setItem('hl17_attendance', JSON.stringify(attendance))
}, [attendance, isLoading])

useEffect(() => {
  if (!isLoading) localStorage.setItem('hl17_deductions', JSON.stringify(deductions))
}, [deductions, isLoading])
```

### Context value additions

```ts
attendance, setAttendance,
deductions, setDeductions,
```

---

## Related Code Files

- `/Users/hoahenry/Desktop/nhansu.hl17/src/types/index.ts` — add new types
- `/Users/hoahenry/Desktop/nhansu.hl17/src/components/auth/AuthProvider.tsx` — extend state, init, persist
- `/Users/hoahenry/Desktop/nhansu.hl17/src/constants/data.ts` — no changes needed (seed is empty arrays)

---

## Implementation Steps

1. Open `src/types/index.ts`, append `WorkUnit` and `DeductionEvent` types after the `AttendanceRecord` block
2. Open `AuthProvider.tsx`:
   a. Import `WorkUnit`, `DeductionEvent` from `@/types`
   b. Add `attendance` and `deductions` to `AuthContextType`
   c. Add `useState<WorkUnit[]>([])` and `useState<DeductionEvent[]>([])`
   d. In the mount `useEffect`: load `hl17_attendance` and `hl17_deductions` from localStorage
   e. After loading user session: run auto-attendance guard (check today + employeeId, insert if absent)
   f. Add two new persist `useEffect` hooks following existing pattern
   g. Add `attendance`, `setAttendance`, `deductions`, `setDeductions` to context value object
3. Update `AuthContextType` default values in `createContext` call

---

## Todo

- [ ] Add `WorkUnit` type to `src/types/index.ts`
- [ ] Add `DeductionEvent` type to `src/types/index.ts`
- [ ] Extend `AuthContextType` definition
- [ ] Update `createContext` default object
- [ ] Add state declarations in `AuthProvider`
- [ ] Load `hl17_attendance` in mount `useEffect`
- [ ] Load `hl17_deductions` in mount `useEffect`
- [ ] Implement auto-attendance logic (post-load, guarded)
- [ ] Add persist effect for `attendance`
- [ ] Add persist effect for `deductions`
- [ ] Add new fields to `useMemo` context value

---

## Success Criteria

- `WorkUnit` and `DeductionEvent` are strongly typed with no `any`
- On first login of the day, a `WorkUnit` with `units: 1.0` is inserted for the logged-in employee
- No duplicate auto-attendance record if user refreshes same day
- `hl17_attendance` and `hl17_deductions` keys appear in localStorage after login
- All other pages compile without errors (context shape change is additive)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Auto-attendance runs during SSR | Medium | Guard with `isLoading` check; auto-attendance only after `setIsLoading(false)` |
| Duplicate init on React StrictMode double-invoke | Low | Use `isInitRef` pattern already in AuthProvider |
| Large localStorage footprint over time | Low | No cleanup needed for prototype; note for future |

---

## Security Considerations

- Same as rest of app: client-side only, localStorage not encrypted
- No cross-employee data leakage risk since reads are filtered by employeeId in page components

---

## Next Steps

→ Phase 02: `/chamcong` redesign reads from `attendance` context
