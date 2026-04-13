# Design Guidelines

**Project:** ADMIN_HL17 — nhansu.hl17
**Last Updated:** 2026-04-13

---

## Design Language

ADMIN_HL17 uses a clean, data-dense admin dashboard aesthetic. The design prioritizes information density and clarity over decorative elements.

**Core principles:**
- Information density over whitespace — tables and data grids are the primary UI pattern
- Consistent Vietnamese terminology — all labels, status strings, and error messages in Vietnamese
- Progressive disclosure — summary stats at top, details in table below
- Light mode only — `forcedTheme="light"` in ThemeProvider; dark mode CSS exists but is disabled

---

## Color System

### Semantic Colors (Status Badges)

| Status | Background | Text | Usage |
|--------|-----------|------|-------|
| Success / Approved | `bg-green-50` | `text-green-700` | `border-green-200` |
| Warning / Pending | `bg-amber-50` | `text-amber-700` | `border-amber-200` |
| Danger / Rejected | `bg-red-50` | `text-red-700` | `border-red-200` |
| Info / Blue | `bg-blue-50` | `text-blue-700` | `border-blue-200` |
| Locked / Orange | `bg-orange-50` | `text-orange-700` | `border-orange-200` |
| Neutral / Draft | `bg-gray-100` | `text-gray-600` | `border-gray-200` |

### Payroll Status Colors

```tsx
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:    { label: 'Nháp',           cls: 'bg-gray-100 text-gray-600' },
  PENDING:  { label: 'Chờ duyệt',      cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt',       cls: 'bg-green-100 text-green-700' },
  LOCKED:   { label: 'Đã khóa',        cls: 'bg-orange-100 text-orange-700' },
  PAID:     { label: 'Đã thanh toán',  cls: 'bg-blue-100 text-blue-700' },
}
```

### App Background

- App background: `bg-[#F5F6FA]` (light gray)
- Cards and panels: `bg-white border border-gray-200`
- Active nav item: `bg-blue-50 text-blue-700`
- Primary action buttons: `bg-blue-600 text-white hover:bg-blue-700`

---

## Typography

| Use Case | Size | Weight | Color |
|----------|------|--------|-------|
| Page title (PageShell) | `text-lg` | `font-semibold` | `text-gray-900` |
| Section header | `text-sm` | `font-semibold` | `text-gray-700` |
| Table header | `text-[11px]` | `font-semibold` | `text-gray-500` |
| Table cell | `text-[13px]` | `font-normal` | `text-gray-800` |
| Label / helper | `text-xs` | `font-normal` | `text-gray-500` |
| Stat value (KPI card) | `text-2xl` or `text-xl` | `font-bold` | `text-gray-900` |
| Status badge | `text-[10px]` | `font-semibold` | varies by status |

Font: Inter (loaded via `next/font/google` in layout).

---

## Layout Patterns

### Page Structure

```
Sidebar (fixed left, 220px)
  └── Main content area (flex-1, scrollable)
        └── PageShell (page wrapper)
              ├── Page title + subtitle
              ├── Summary stats row (stat cards)
              ├── Filter/action bar
              └── Data table or grid
```

### Summary Stats Row

Stat cards above the main table — 2–4 cards showing key metrics for the current view:

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs text-gray-500">Tổng nhân viên</p>
    <p className="text-2xl font-bold text-gray-900">{count}</p>
  </div>
</div>
```

### Filter Bar

Consistent filter row above data tables:

```tsx
<div className="flex items-center gap-3 mb-4">
  <input
    type="text"
    placeholder="Tìm kiếm..."
    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
  />
  <select className="px-3 py-2 text-sm border border-gray-200 rounded-lg">
    <option value="">Tất cả phòng ban</option>
  </select>
  <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
    + Thêm
  </button>
</div>
```

---

## Component Patterns

### Data Table

```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <table className="w-full text-[13px]">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Họ tên
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-gray-800">Nguyễn Văn A</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Status Badge

```tsx
<span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_MAP[status].cls}`}>
  {STATUS_MAP[status].label}
</span>
```

### Modal

```tsx
<div
  className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
  onClick={() => setOpen(false)}
>
  <div
    onClick={e => e.stopPropagation()}
    className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
  >
    <h2 className="text-base font-semibold text-gray-900 mb-4">Tiêu đề</h2>
    {/* Content */}
    <div className="flex justify-end gap-3 mt-6">
      <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">
        Hủy
      </button>
      <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">
        Lưu
      </button>
    </div>
  </div>
</div>
```

### Action Buttons

```tsx
{/* Primary action */}
<button className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
  <Plus size={14} />
  Thêm mới
</button>

{/* Secondary action */}
<button className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
  <RefreshCw size={14} />
  Cập nhật
</button>

{/* Danger action */}
<button className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
  <Trash2 size={14} />
  Xóa
</button>
```

### Loading State

```tsx
{isLoading ? (
  <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
    Đang tải...
  </div>
) : (
  <table>...</table>
)}
```

---

## Vietnamese UI Terminology Reference

| English | Vietnamese (UI) |
|---------|----------------|
| Employee | Nhân viên |
| Attendance | Chấm công |
| Payroll / Salary | Lương |
| Bonus | Thưởng |
| Leave | Nghỉ phép |
| Recruitment | Tuyển dụng |
| Revenue | Doanh thu |
| Expense | Chi phí |
| Cashflow | Dòng tiền |
| Budget | Ngân sách |
| Debt / Receivables | Công nợ |
| Reports | Báo cáo |
| Permissions | Phân quyền |
| Settings | Cài đặt |
| Add | Thêm |
| Edit | Sửa |
| Delete | Xóa |
| Save | Lưu |
| Cancel | Hủy |
| Search | Tìm kiếm |
| Filter | Lọc |
| Export | Xuất |
| Approve | Duyệt |
| Reject | Từ chối |
| Pending | Chờ duyệt |
| Approved | Đã duyệt |
| Rejected | Đã từ chối |
| Draft | Nháp |
| Locked | Đã khóa |
| Paid | Đã thanh toán |
| Department | Phòng ban |
| Position | Chức vụ |
| Contract | Hợp đồng |

---

## Border Radius

- Buttons: `rounded-lg` (8px)
- Cards / table containers: `rounded-xl` (12px)
- Modals: `rounded-2xl` (16px)
- Badges: `rounded-full` (pill)
- Inputs: `rounded-lg` (8px)

## Spacing

- Card padding: `p-4` (16px) or `p-6` (24px)
- Table cell padding: `px-4 py-3`
- Gap between filter items: `gap-3`
- Gap between stat cards: `gap-4`
- Margin below filter bar: `mb-4`
- Margin below stat row: `mb-6`

## Sidebar

- Width: 220px (fixed)
- Background: `bg-white border-r border-gray-200`
- Nav item height: `py-2 px-3`
- Active item: `bg-blue-50 text-blue-700 rounded-lg`
- Inactive item: `text-gray-600 hover:bg-gray-50 rounded-lg`
- Section labels: `text-[10px] font-semibold text-gray-400 uppercase tracking-wide`
- Icons: Lucide React, `size={16}`
