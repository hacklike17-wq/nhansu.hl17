# Phase 07 — Navigation & Routing Cleanup

**Parent plan:** [plan.md](./plan.md)
**Dependencies:** Phases 02–06 (all module redesigns complete)
**Date:** 2026-04-12
**Priority:** Low
**Status:** pending

---

## Overview

Update sidebar navigation labels to reflect the module renames: `/chamcong` → "Công số nhận", `/nghiphep` → "Công số trừ". Verify all `ROUTE_PERMISSION` entries, `NAV_SECTIONS` labels, and Sidebar icon mappings are consistent with redesigned modules.

---

## Key Insights

- `NAV_SECTIONS` in `constants/data.ts` drives sidebar label text. Route paths remain unchanged (`/chamcong`, `/nghiphep`) — only the display labels change.
- `ROUTE_PERMISSION` map does not need changes (paths unchanged).
- `Sidebar.tsx` `ICON_MAP` may need new icon for the HR management tab in `/caidat` (if any nav item points there), but `/caidat` tab is internal — no new route.
- `ALL_MODULES` in `constants/data.ts` has `label` fields used in the permission matrix UI — consider updating those labels too for consistency.

---

## Requirements

1. Update `NAV_SECTIONS` label for `/chamcong` from "Chấm công" to "Công số nhận"
2. Update `NAV_SECTIONS` label for `/nghiphep` from "Nghỉ phép" to "Công số trừ"
3. Update `ALL_MODULES` labels for same keys (for permission matrix display)
4. Verify `Sidebar.tsx` renders updated labels (it reads from `NAV_SECTIONS` directly — no extra change needed)
5. Verify `PageShell` titles in Phase 02 and Phase 03 pages match new labels
6. No new routes needed

---

## Architecture

### NAV_SECTIONS changes (constants/data.ts)

Find and update in the HR section:
```ts
// Before:
{ label: 'Chấm công', href: '/chamcong', icon: 'clock' }
{ label: 'Nghỉ phép', href: '/nghiphep', icon: 'calendar-off' }

// After:
{ label: 'Công số nhận', href: '/chamcong', icon: 'clock' }
{ label: 'Công số trừ', href: '/nghiphep', icon: 'calendar-off' }
```

### ALL_MODULES changes (constants/data.ts)

```ts
// Before:
{ key: 'chamcong', label: 'Chấm công' }
{ key: 'nghiphep', label: 'Nghỉ phép' }

// After:
{ key: 'chamcong', label: 'Công số nhận' }
{ key: 'nghiphep', label: 'Công số trừ' }
```

### No route changes

`/chamcong` and `/nghiphep` paths stay the same. `ROUTE_PERMISSION` keys unchanged.

---

## Related Code Files

- `/Users/hoahenry/Desktop/nhansu.hl17/src/constants/data.ts` — `NAV_SECTIONS`, `ALL_MODULES`
- `/Users/hoahenry/Desktop/nhansu.hl17/src/components/layout/Sidebar.tsx` — reads `NAV_SECTIONS` (verify, no edit expected)
- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/chamcong/page.tsx` — `PageShell` title (Phase 02 should already set this)
- `/Users/hoahenry/Desktop/nhansu.hl17/src/app/nghiphep/page.tsx` — `PageShell` title (Phase 03 should already set this)

---

## Implementation Steps

1. Open `src/constants/data.ts`
2. Find `NAV_SECTIONS` — locate the HR/nhân sự section
3. Change `label` for `/chamcong` item to `'Công số nhận'`
4. Change `label` for `/nghiphep` item to `'Công số trừ'`
5. Find `ALL_MODULES` array
6. Change `label` for `chamcong` entry to `'Công số nhận'`
7. Change `label` for `nghiphep` entry to `'Công số trừ'`
8. Open `Sidebar.tsx` — confirm it uses `item.label` from NAV_SECTIONS (no hardcoded strings)
9. Run `npm run lint` to confirm no errors
10. Manual smoke test: login as employee → verify sidebar shows new labels

---

## Todo

- [ ] Update `NAV_SECTIONS[chamcong].label` → "Công số nhận"
- [ ] Update `NAV_SECTIONS[nghiphep].label` → "Công số trừ"
- [ ] Update `ALL_MODULES[chamcong].label` → "Công số nhận"
- [ ] Update `ALL_MODULES[nghiphep].label` → "Công số trừ"
- [ ] Verify `PageShell` titles in Phase 02/03 already set correctly
- [ ] Run lint check
- [ ] Smoke test sidebar labels in browser

---

## Success Criteria

- Sidebar shows "Công số nhận" and "Công số trừ" labels
- Permission matrix in `/phanquyen` shows updated module labels
- `PageShell` breadcrumb/titles consistent with sidebar labels
- No regressions in routing or permission checks

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Permission matrix label confusion (old vs new label) | Low | `ALL_MODULES` update covers this |
| Any hardcoded "Chấm công" / "Nghỉ phép" strings in page components | Low | Search codebase for literal strings before merge |

---

## Security Considerations

None — label-only changes, no logic or permission keys affected.

---

## Next Steps

All phases complete. Verify end-to-end flow:
1. Login → auto-attendance created
2. `/chamcong` → work units visible
3. Submit deduction in `/nghiphep` → approve as admin
4. `/luong` → salary calculated correctly
5. `/nhanvien` → employee sees profile card, admin sees table
6. `/caidat` → admin manages employees in HR tab
