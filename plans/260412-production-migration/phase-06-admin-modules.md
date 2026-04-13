# Phase 06 — Admin Modules: Settings, Permissions, Salary Config

**Parent:** `plan.md`
**Dependencies:** Phase 01 (schema), Phase 02 (auth), Phase 03 (API pattern), Phase 04 (SalaryColumn/SalaryValue)
**Research refs:** `research/researcher-02-schema-design.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Migrate the admin-only modules — Company Settings, System Config, PITBracket/InsuranceRate rates, Salary Column config, and Permission Group management — from hardcoded constants + localStorage to DB-backed admin UI.
- **Priority:** Medium
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- `PITBracket` and `InsuranceRate` tables are the most critical pieces of this phase — July 2026 PIT reform changes both the brackets and deduction allowances. These must be editable by `boss_admin` without code changes.
- `PermissionGroup` is currently seeded with 5 system groups. The DB allows adding custom groups. `isSystem: true` groups should not be deletable (enforce in service layer).
- `SalaryColumn` dynamic formula columns (from `types/index.ts`) map directly to the `SalaryColumn` DB table. The formula evaluator (`src/lib/formula.ts`) is server-side only after migration — never exposed to client.
- `CompanySettings` is a single row per company (upsert pattern). Store as a separate table, not in the Company model, to allow multi-key versioning if needed.
- The `/caidat` page currently has multiple tabs (company info, system config, salary columns, tax rates). After migration each tab's save is an independent Server Action.
- `/phanquyen` page manages PermissionGroup CRUD. After migration, permission changes take effect on next login (session refresh doesn't update permissions mid-session — by design, consistent with most RBAC systems).

---

## Requirements

### Settings (/caidat)
- **Company Info tab:** CompanySettings upsert (name, taxCode, address, contact, bank)
- **System Config tab:** workHoursPerDay, workDaysPerWeek, overtime/holiday rates, leavePerYear — stored as `SystemConfig` table (single row per company, upsert)
- **Salary Columns tab:** SalaryColumn CRUD — add/edit/delete/reorder formula columns
- **Tax Rates tab:** PITBracket CRUD — add brackets, set validFrom/validTo dates; InsuranceRate CRUD — update employee/employer rates with validity periods
- All tabs: requires `caidat.edit` permission

### Permissions (/phanquyen)
- List PermissionGroup from DB
- Create custom group: Server Action
- Edit group permissions: Server Action (granular permission toggles by module + action)
- Delete non-system group: Server Action
- Cannot delete/modify `isSystem: true` groups via UI (boss_admin can override via DB only)
- Requires `phanquyen.edit` permission

---

## Architecture

### File structure

```
src/
  app/
    caidat/
      page.tsx              ← Server Component — fetches all config
      actions.ts            ← updateCompanySettings, updateSystemConfig,
                               createSalaryColumn, updateSalaryColumn, deleteSalaryColumn,
                               upsertPITBracket, deletePITBracket,
                               upsertInsuranceRate
      components/
        CompanyInfoTab.tsx  ← 'use client' (form state)
        SystemConfigTab.tsx ← 'use client'
        SalaryColumnsTab.tsx← 'use client' — drag-to-reorder, formula editor
        TaxRatesTab.tsx     ← 'use client' — PITBracket + InsuranceRate tables

    phanquyen/
      page.tsx              ← Server Component
      actions.ts            ← createPermissionGroup, updatePermissionGroup, deletePermissionGroup
      components/
        PermissionGroupTable.tsx   ← 'use client'
        PermissionGroupModal.tsx   ← 'use client' — checkbox matrix

  services/
    settings.service.ts
    permission.service.ts

  lib/
    schemas/
      settings.ts           ← Zod schemas for all settings models
```

### settings.service.ts

```typescript
export const settingsService = {
  async getCompanySettings(companyId: string) {
    return db.companySettings.findUnique({ where: { companyId } })
  },

  async upsertCompanySettings(companyId: string, data: CompanySettingsInput) {
    return db.companySettings.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    })
  },

  async getSalaryColumns(companyId: string) {
    return db.salaryColumn.findMany({ where: { companyId }, orderBy: { order: "asc" } })
  },

  async createSalaryColumn(companyId: string, data: CreateSalaryColumnInput) {
    // Validate formula trước khi lưu
    if (data.type === "formula" && data.formula) {
      try {
        const { evalFormula } = await import("@/lib/formula")
        const dummyVars = { luong_co_ban: 10_000_000, net_cong_so: 26, gio_tang_ca: 0 }
        evalFormula(data.formula, dummyVars)  // throws nếu formula lỗi
      } catch (e) {
        throw new Error(`Formula không hợp lệ: ${(e as Error).message}`)
      }
    }
    // Validate key uniqueness trong cùng company
    const existing = await db.salaryColumn.findFirst({ where: { companyId, key: data.key } })
    if (existing) throw new Error(`Key "${data.key}" đã tồn tại`)

    const maxOrder = await db.salaryColumn.aggregate({ where: { companyId }, _max: { order: true } })
    return db.salaryColumn.create({ data: { companyId, ...data, order: (maxOrder._max.order ?? 0) + 1 } })
  },

  async updateSalaryColumn(companyId: string, id: string, data: Partial<CreateSalaryColumnInput>) {
    if (data.type === "formula" && data.formula) {
      try {
        const { evalFormula } = await import("@/lib/formula")
        evalFormula(data.formula, { luong_co_ban: 10_000_000, net_cong_so: 26, gio_tang_ca: 0 })
      } catch (e) {
        throw new Error(`Formula không hợp lệ: ${(e as Error).message}`)
      }
    }
    return db.salaryColumn.update({ where: { id, companyId }, data })
  },

  async deleteSalaryColumn(companyId: string, id: string) {
    const col = await db.salaryColumn.findUnique({ where: { id } })
    if (col?.isSystem) throw new Error("Cannot delete system column")
    return db.salaryColumn.delete({ where: { id, companyId } })
  },

  async getPITBrackets(companyId: string) {
    return db.pITBracket.findMany({ where: { companyId }, orderBy: { minIncome: "asc" } })
  },

  async upsertPITBracket(companyId: string, data: PITBracketInput) {
    // Kiểm tra overlap trước khi lưu
    const overlapping = await db.pITBracket.findFirst({
      where: {
        companyId,
        id: data.id ? { not: data.id } : undefined,
        validFrom: { lte: data.validTo ?? new Date("9999-12-31") },
        OR: [{ validTo: null }, { validTo: { gte: data.validFrom } }],
        AND: [
          { minIncome: { lt: data.maxIncome } },
          { maxIncome: { gt: data.minIncome } },
        ],
      },
    })
    if (overlapping) throw new Error("Khung thuế bị chồng chéo với bản ghi hiện có trong cùng kỳ")

    if (data.id) return db.pITBracket.update({ where: { id: data.id }, data })
    return db.pITBracket.create({ data: { companyId, ...data } })
  },

  async upsertInsuranceRate(companyId: string, data: InsuranceRateInput) {
    // Kiểm tra overlap cho cùng loại bảo hiểm (BHXH/BHYT/BHTN)
    const overlapping = await db.insuranceRate.findFirst({
      where: {
        companyId,
        type: data.type,
        id: data.id ? { not: data.id } : undefined,
        validFrom: { lte: data.validTo ?? new Date("9999-12-31") },
        OR: [{ validTo: null }, { validTo: { gte: data.validFrom } }],
      },
    })
    if (overlapping) throw new Error(`Tỷ lệ ${data.type} bị chồng chéo kỳ hiệu lực với bản ghi hiện có`)

    if (data.id) return db.insuranceRate.update({ where: { id: data.id }, data })
    return db.insuranceRate.create({ data: { companyId, ...data } })
  },

  async getInsuranceRates(companyId: string) {
    return db.insuranceRate.findMany({ where: { companyId }, orderBy: { validFrom: "desc" } })
  },
}
```

### permission.service.ts

```typescript
export const permissionService = {
  async list(companyId: string) {
    return db.permissionGroup.findMany({ where: { companyId }, orderBy: { name: "asc" } })
  },

  async create(companyId: string, data: CreatePermissionGroupInput) {
    return db.permissionGroup.create({ data: { companyId, ...data, isSystem: false } })
  },

  async update(companyId: string, id: string, data: { permissions: string[] }) {
    const group = await db.permissionGroup.findUnique({ where: { id } })
    // isSystem groups CAN be updated — admin may extend system roles
    return db.permissionGroup.update({ where: { id, companyId }, data })
  },

  async delete(companyId: string, id: string) {
    const group = await db.permissionGroup.findUnique({ where: { id } })
    if (group?.isSystem) throw new Error("Cannot delete system permission group")
    return db.permissionGroup.delete({ where: { id, companyId } })
  },
}
```

### Zod schemas (src/lib/schemas/settings.ts)

```typescript
export const CompanySettingsSchema = z.object({
  name: z.string().min(1).max(200),
  taxCode: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional().or(z.literal("")),
  director: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
})

export const SalaryColumnSchema = z.object({
  name: z.string().min(1),
  key: z.string().regex(/^[a-z_][a-z0-9_]*$/, "snake_case only — chỉ dùng a-z, 0-9, _"),
  type: z.enum(["number", "formula"]),
  formula: z.string().optional(),
  isEditable: z.boolean(),
  order: z.number().int().optional(),
}).refine(data => data.type !== "formula" || !!data.formula, {
  message: "Formula bắt buộc khi type = formula",
  path: ["formula"],
})

export const PITBracketSchema = z.object({
  id: z.string().optional(),
  minIncome: z.coerce.number().int().min(0),
  maxIncome: z.coerce.number().int().min(0),
  rate: z.coerce.number().min(0).max(1),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().optional(),
})

export const InsuranceRateSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["BHXH", "BHYT", "BHTN"]),
  employeeRate: z.coerce.number().min(0).max(1),
  employerRate: z.coerce.number().min(0).max(1),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().optional(),
})
```

### Permission matrix UI pattern

The `/phanquyen` modal shows a checkbox matrix:
- Rows: `ALL_MODULES` (from `constants/data.ts` — kept as UI config)
- Columns: `ALL_ACTIONS` (view, edit, delete, approve, export, config)
- Each cell = `<module>.<action>` permission string
- On save: Server Action receives `permissions: string[]` array, writes to DB

```typescript
// PermissionGroupModal.tsx
'use client'
import { ALL_MODULES, ALL_ACTIONS } from "@/constants/data"

// Build permission key
const key = `${module.key}.${action}`
const checked = permissions.includes(key) || permissions.includes("*")
```

---

## Related Code Files

**Current files that will change:**
- `src/app/caidat/page.tsx` — convert to Server Component
- `src/app/phanquyen/page.tsx` — convert to Server Component

**New files:**
- `src/app/caidat/actions.ts`
- `src/app/caidat/components/CompanyInfoTab.tsx`
- `src/app/caidat/components/SystemConfigTab.tsx`
- `src/app/caidat/components/SalaryColumnsTab.tsx`
- `src/app/caidat/components/TaxRatesTab.tsx`
- `src/app/phanquyen/actions.ts`
- `src/app/phanquyen/components/PermissionGroupTable.tsx`
- `src/app/phanquyen/components/PermissionGroupModal.tsx`
- `src/services/settings.service.ts`
- `src/services/permission.service.ts`
- `src/lib/schemas/settings.ts`

**Note on constants/data.ts:** After migration, keep `ALL_MODULES`, `ALL_ACTIONS`, `ROUTE_PERMISSION`, `hasPermission()`, `NAV_SECTIONS` — these are UI config, not data. Remove only the data arrays (EMPLOYEES, SALARY_DATA, etc.) in Phase 07.

---

## Implementation Steps

1. Write `settings.service.ts` and `permission.service.ts`
2. Write `src/lib/schemas/settings.ts`
3. Convert `/caidat/page.tsx` to Server Component — fetch CompanySettings, SystemConfig, SalaryColumns, PITBrackets, InsuranceRates in parallel
4. Extract 4 tab components as client components
5. Write `caidat/actions.ts` — one Server Action per config type
6. Add formula validation trong `createSalaryColumn` + `updateSalaryColumn` — `evalFormula()` với dummy vars + key uniqueness check (service layer, không chỉ Zod)
7. Convert `/phanquyen/page.tsx` to Server Component
8. Extract PermissionGroupTable + PermissionGroupModal
9. Write `phanquyen/actions.ts`
10. Test: create new PITBracket → payroll calculation in Phase 04 picks it up
11. Test: update PermissionGroup → changes reflected on next login

---

## Todo List

- [ ] Write settings.service.ts
- [ ] Write permission.service.ts
- [ ] Write settings Zod schemas
- [ ] Convert /caidat to Server Component
- [ ] Build CompanyInfoTab (form + Server Action)
- [ ] Build SystemConfigTab
- [ ] Build SalaryColumnsTab (add/edit/delete/reorder)
- [ ] Build TaxRatesTab (PITBracket + InsuranceRate CRUD với overlap validation)
- [ ] Verify PITBracket overlap error hiển thị rõ ràng trong UI khi nhập trùng kỳ
- [ ] Verify InsuranceRate overlap error cho từng loại (BHXH/BHYT/BHTN) riêng biệt
- [ ] Convert /phanquyen to Server Component
- [ ] Build PermissionGroupTable + modal
- [ ] Write phanquyen actions
- [ ] Test PITBracket update flows into payroll calculation
- [ ] Test permission group change applies on next login

---

## Success Criteria

- Company settings save persists to DB; reload shows updated values
- New SalaryColumn với formula hợp lệ → tạo thành công; formula lỗi syntax → báo lỗi rõ, không lưu
- Tạo SalaryColumn với key trùng → báo "Key đã tồn tại"
- Cannot delete system SalaryColumn (isSystem=true) — error shown
- PITBracket CRUD works; new bracket với future validFrom được dùng trong payroll tháng đó
- Tạo PITBracket overlap kỳ hiệu lực → báo lỗi, không lưu
- Tạo InsuranceRate BHXH overlap → báo lỗi; InsuranceRate BHYT không overlap → lưu thành công (types độc lập)
- Permission group update takes effect on next user login
- Cannot delete system PermissionGroup

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Formula column key collision | Medium | Medium | Validate uniqueness of `key` field in Zod + DB unique constraint |
| PIT bracket overlap (two brackets same range) | Low | High | Add validation: no two brackets with same validFrom and overlapping income range |
| Permission group delete with users still assigned | Low | Medium | Check User table for role matching group name before delete |

---

## Security Considerations

- All settings mutations require `caidat.edit` or `caidat.config` permissions
- PITBracket/InsuranceRate changes are audit-logged (AuditLog.entityType = "PITBracket")
- Formula column keys are validated as snake_case — prevent injection via `evalFormula()` by restricting variable names
- `isSystem` flag on PermissionGroup cannot be set by API — only seeded initially

---

## Next Steps

Phase 07 (Data Migration) removes all dependency on `constants/data.ts` data arrays and runs the final seed. Phase 08 (Deployment) follows.
