# Modules Redesign — ADMIN_HL17

**Date:** 2026-04-12
**Project:** nhansu.hl17
**Description:** Redesign 5 HR modules to use dynamic localStorage-based data, role-scoped views, approval flows, and auto-calculated payroll. Add new "Quản lý nhân sự" tab to /caidat.

---

## Phase Table

| Phase | Name | Priority | Status | File |
|-------|------|----------|--------|------|
| 01 | Data Foundation | Critical | pending | [phase-01-data-foundation.md](./phase-01-data-foundation.md) |
| 02 | Công số nhận (/chamcong) | High | pending | [phase-02-cong-so-nhan.md](./phase-02-cong-so-nhan.md) |
| 03 | Công số trừ (/nghiphep) | High | pending | [phase-03-cong-so-tru.md](./phase-03-cong-so-tru.md) |
| 04 | Lương & Thưởng (/luong) | High | pending | [phase-04-luong-thuong.md](./phase-04-luong-thuong.md) |
| 05 | Hồ sơ nhân viên (/nhanvien) | Medium | pending | [phase-05-nhanvien-profile.md](./phase-05-nhanvien-profile.md) |
| 06 | Quản lý nhân sự (/caidat) | Medium | pending | [phase-06-quan-ly-nhansu.md](./phase-06-quan-ly-nhansu.md) |
| 07 | Navigation cleanup | Low | pending | [phase-07-navigation.md](./phase-07-navigation.md) |

---

## Dependency Order

```
Phase 01 (types + localStorage + AuthProvider)
  └── Phase 02 (chamcong reads hl17_attendance)
        └── Phase 03 (nghiphep writes hl17_deductions)
              └── Phase 04 (luong reads both, calculates pay)
                    └── Phase 05 (nhanvien self-view, reads context)
                          └── Phase 06 (caidat HR tab, full CRUD)
                                └── Phase 07 (nav labels, routing)
```

## Key Design Decisions

- All module data stored in localStorage keys `hl17_attendance`, `hl17_deductions`
- AuthProvider extended with `attendance`, `setAttendance`, `deductions`, `setDeductions`
- Auto-attendance: on app load, if today has no record for logged-in employee → insert 1.0 unit
- Salary formula: `(công_số_nhận − công_số_trừ) × (baseSalary / 26)`
- DeductionEvent covers both negative (nghỉ/muộn) and positive (OT) adjustments
- Employee role = read-only self-view; Admin/HR = full management
