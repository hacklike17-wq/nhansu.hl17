/**
 * backup.service.ts — system backup / restore (JSON)
 *
 * Backs up "setup" data (config that's painful to re-enter) without touching
 * transactional / monthly tables. Exporting returns a single JSON file; the
 * importer accepts the same JSON and upserts every section present, auto-
 * detecting scope based on which keys are filled in.
 *
 * Scope selector:
 *   - "all"           → everything below
 *   - "salary-config" → company, companySettings, salaryColumns,
 *                       salaryColumnVersions, pitBrackets, insuranceRates
 *   - "hr"            → employees, users (no password), permissionGroups
 *
 * Import strategy:
 *   - Upsert by STABLE keys (never by cuid) so cross-environment restores work:
 *       Employee             → (companyId, email)
 *       User                 → email (globally unique)
 *       SalaryColumn         → (companyId, key)
 *       SalaryColumnVersion  → (companyId, columnKey, effectiveFrom)
 *       PermissionGroup      → (companyId, name)
 *       CompanySettings      → companyId
 *   - PITBracket / InsuranceRate have no unique constraint — handled by
 *     replace-all-in-company (delete then createMany) so re-importing doesn't
 *     create duplicate rows.
 *   - Monthly tables (WorkUnit, Payroll, AuditLog, …) are NEVER touched.
 *   - User.password is intentionally not exported and not overwritten.
 */
import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"

export const BACKUP_VERSION = "1" as const
export type BackupScope = "all" | "salary-config" | "hr"

type JsonDate = string // ISO string; Decimal is serialized as string as well

// ─── Row types (plain JSON, no Date / Decimal objects) ──────────────────────

type CompanyRow = {
  name: string
  taxId: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  director: string | null
  bankAccount: string | null
  bankName: string | null
  logo: string | null
  foundedDate: JsonDate | null
}

type CompanySettingsRow = {
  workHoursPerDay: number
  workDaysPerWeek: number
  overtimeRate: string
  holidayRate: string
  leavePerYear: number
  currency: string
  locale: string
  enableInsuranceTax: boolean
}

type SalaryColumnRow = {
  name: string
  key: string
  type: string
  formula: string | null
  isEditable: boolean
  isSystem: boolean
  calcMode: string
  order: number
}

type SalaryColumnVersionRow = {
  columnKey: string
  name: string
  formula: string | null
  type: string
  effectiveFrom: JsonDate
  createdBy: string | null
}

type PITBracketRow = {
  minIncome: string
  maxIncome: string | null
  rate: string
  validFrom: JsonDate
  validTo: JsonDate | null
}

type InsuranceRateRow = {
  type: string
  employeeRate: string
  employerRate: string
  validFrom: JsonDate
  validTo: JsonDate | null
}

type EmployeeRow = {
  code: string | null
  fullName: string
  email: string
  phone: string | null
  dob: JsonDate | null
  gender: string | null
  idCard: string | null
  address: string | null
  department: string
  position: string
  status: string
  contractType: string
  startDate: JsonDate
  endDate: JsonDate | null
  baseSalary: string
  responsibilitySalary: string
  bankAccount: string | null
  bankName: string | null
  taxCode: string | null
  bhxhCode: string | null
  accountStatus: string
  deletedAt: JsonDate | null
}

type UserRow = {
  email: string
  name: string | null
  role: string
  permissions: string[]
  // Link to employee by email (not cuid) so cross-environment restore works.
  employeeEmail: string | null
}

type PermissionGroupRow = {
  name: string
  label: string
  permissions: string[]
  description: string | null
  isSystem: boolean
}

export type BackupFile = {
  version: typeof BACKUP_VERSION
  exportedAt: string
  scope: BackupScope
  companyId: string
  companyName: string
  data: {
    company?: CompanyRow
    companySettings?: CompanySettingsRow
    salaryColumns?: SalaryColumnRow[]
    salaryColumnVersions?: SalaryColumnVersionRow[]
    pitBrackets?: PITBracketRow[]
    insuranceRates?: InsuranceRateRow[]
    employees?: EmployeeRow[]
    users?: UserRow[]
    permissionGroups?: PermissionGroupRow[]
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dateStr(d: Date | null | undefined): JsonDate | null {
  if (!d) return null
  return new Date(d).toISOString().slice(0, 10)
}

function dec(v: unknown): string {
  if (v == null) return "0"
  return typeof v === "object" && "toString" in (v as object)
    ? String(v)
    : String(v)
}

// ─── Export ─────────────────────────────────────────────────────────────────

export async function buildBackup(
  companyId: string,
  scope: BackupScope
): Promise<BackupFile> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    include: { settings: true },
  })
  if (!company) throw new Error("Không tìm thấy công ty")

  const wantSalary = scope === "all" || scope === "salary-config"
  const wantHr = scope === "all" || scope === "hr"

  const data: BackupFile["data"] = {}

  if (wantSalary) {
    data.company = {
      name: company.name,
      taxId: company.taxId,
      address: company.address,
      phone: company.phone,
      email: company.email,
      website: company.website,
      director: company.director,
      bankAccount: company.bankAccount,
      bankName: company.bankName,
      logo: company.logo,
      foundedDate: dateStr(company.foundedDate),
    }
    if (company.settings) {
      data.companySettings = {
        workHoursPerDay: company.settings.workHoursPerDay,
        workDaysPerWeek: company.settings.workDaysPerWeek,
        overtimeRate: dec(company.settings.overtimeRate),
        holidayRate: dec(company.settings.holidayRate),
        leavePerYear: company.settings.leavePerYear,
        currency: company.settings.currency,
        locale: company.settings.locale,
        enableInsuranceTax: company.settings.enableInsuranceTax,
      }
    }

    const [salaryCols, salaryColVers, pitBrackets, insuranceRates] =
      await Promise.all([
        db.salaryColumn.findMany({ where: { companyId }, orderBy: { order: "asc" } }),
        db.salaryColumnVersion.findMany({ where: { companyId } }),
        db.pITBracket.findMany({ where: { companyId } }),
        db.insuranceRate.findMany({ where: { companyId } }),
      ])

    data.salaryColumns = salaryCols.map(c => ({
      name: c.name,
      key: c.key,
      type: c.type,
      formula: c.formula,
      isEditable: c.isEditable,
      isSystem: c.isSystem,
      calcMode: String(c.calcMode),
      order: c.order,
    }))
    data.salaryColumnVersions = salaryColVers.map(v => ({
      columnKey: v.columnKey,
      name: v.name,
      formula: v.formula,
      type: v.type,
      effectiveFrom: dateStr(v.effectiveFrom)!,
      createdBy: v.createdBy,
    }))
    data.pitBrackets = pitBrackets.map(b => ({
      minIncome: dec(b.minIncome),
      maxIncome: b.maxIncome == null ? null : dec(b.maxIncome),
      rate: dec(b.rate),
      validFrom: dateStr(b.validFrom)!,
      validTo: dateStr(b.validTo),
    }))
    data.insuranceRates = insuranceRates.map(r => ({
      type: String(r.type),
      employeeRate: dec(r.employeeRate),
      employerRate: dec(r.employerRate),
      validFrom: dateStr(r.validFrom)!,
      validTo: dateStr(r.validTo),
    }))
  }

  if (wantHr) {
    const [employees, users, permGroups] = await Promise.all([
      db.employee.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { code: "asc" },
      }),
      db.user.findMany({
        where: { companyId },
        include: { employee: { select: { email: true } } },
      }),
      db.permissionGroup.findMany({ where: { companyId } }),
    ])

    data.employees = employees.map(e => ({
      code: e.code,
      fullName: e.fullName,
      email: e.email,
      phone: e.phone,
      dob: dateStr(e.dob),
      gender: e.gender,
      idCard: e.idCard,
      address: e.address,
      department: e.department,
      position: e.position,
      status: String(e.status),
      contractType: String(e.contractType),
      startDate: dateStr(e.startDate)!,
      endDate: dateStr(e.endDate),
      baseSalary: dec(e.baseSalary),
      responsibilitySalary: dec(e.responsibilitySalary),
      bankAccount: e.bankAccount,
      bankName: e.bankName,
      taxCode: e.taxCode,
      bhxhCode: e.bhxhCode,
      accountStatus: String(e.accountStatus),
      deletedAt: dateStr(e.deletedAt),
    }))
    data.users = users.map(u => ({
      email: u.email,
      name: u.name,
      role: u.role,
      permissions: u.permissions,
      employeeEmail: u.employee?.email ?? null,
    }))
    data.permissionGroups = permGroups.map(g => ({
      name: g.name,
      label: g.label,
      permissions: g.permissions,
      description: g.description,
      isSystem: g.isSystem,
    }))
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    companyId,
    companyName: company.name,
    data,
  }
}

// ─── Import (restore) ───────────────────────────────────────────────────────

export type RestoreSummary = {
  sections: Record<string, { count: number; applied: boolean }>
  warnings: string[]
}

/**
 * Validate the shape of an uploaded JSON without actually applying it.
 * Returns the parsed file or throws a user-facing error message.
 */
export function parseBackupFile(json: unknown): BackupFile {
  if (!json || typeof json !== "object") {
    throw new Error("File JSON không hợp lệ")
  }
  const f = json as Partial<BackupFile>
  if (f.version !== BACKUP_VERSION) {
    throw new Error(`Phiên bản backup không khớp (đọc được "${f.version}", cần "${BACKUP_VERSION}")`)
  }
  if (!f.data || typeof f.data !== "object") {
    throw new Error("Thiếu khối data trong file backup")
  }
  return f as BackupFile
}

/**
 * Apply a BackupFile to the DB. All operations wrapped in one transaction so
 * a FK failure mid-flight rolls back everything.
 *
 * `companyId` is the CURRENT tenant (from session) — we ALWAYS use this,
 * ignoring whatever companyId was stored in the file. That way you can
 * restore a backup from company A into company B without leaking IDs.
 */
export async function applyBackup(
  companyId: string,
  file: BackupFile,
  opts: { dryRun?: boolean } = {}
): Promise<RestoreSummary> {
  const warnings: string[] = []
  const d = file.data
  const sections: RestoreSummary["sections"] = {}

  // Helper: record a section's intended count
  const mark = (name: string, count: number) => {
    sections[name] = { count, applied: !opts.dryRun }
  }

  // Pre-count everything so dry-run and live runs show the same preview
  if (d.company) mark("company", 1)
  if (d.companySettings) mark("companySettings", 1)
  if (d.salaryColumns) mark("salaryColumns", d.salaryColumns.length)
  if (d.salaryColumnVersions) mark("salaryColumnVersions", d.salaryColumnVersions.length)
  if (d.pitBrackets) mark("pitBrackets", d.pitBrackets.length)
  if (d.insuranceRates) mark("insuranceRates", d.insuranceRates.length)
  if (d.employees) mark("employees", d.employees.length)
  if (d.users) mark("users", d.users.length)
  if (d.permissionGroups) mark("permissionGroups", d.permissionGroups.length)

  if (opts.dryRun) return { sections, warnings }

  // Live run — one atomic transaction.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Company (update-only — we never create a new Company row via backup)
    if (d.company) {
      await tx.company.update({
        where: { id: companyId },
        data: {
          name: d.company.name,
          taxId: d.company.taxId,
          address: d.company.address,
          phone: d.company.phone,
          email: d.company.email,
          website: d.company.website,
          director: d.company.director,
          bankAccount: d.company.bankAccount,
          bankName: d.company.bankName,
          logo: d.company.logo,
          foundedDate: d.company.foundedDate ? new Date(d.company.foundedDate) : null,
        },
      })
    }

    // 2. CompanySettings (upsert by companyId)
    if (d.companySettings) {
      await tx.companySettings.upsert({
        where: { companyId },
        create: { companyId, ...d.companySettings },
        update: { ...d.companySettings },
      })
    }

    // 3. PermissionGroup (upsert by unique (companyId, name))
    if (d.permissionGroups) {
      for (const g of d.permissionGroups) {
        await tx.permissionGroup.upsert({
          where: { companyId_name: { companyId, name: g.name } },
          create: { companyId, ...g },
          update: { label: g.label, permissions: g.permissions, description: g.description, isSystem: g.isSystem },
        })
      }
    }

    // 4. SalaryColumn (upsert by (companyId, key))
    if (d.salaryColumns) {
      for (const c of d.salaryColumns) {
        await tx.salaryColumn.upsert({
          where: { companyId_key: { companyId, key: c.key } },
          create: {
            companyId,
            name: c.name,
            key: c.key,
            type: c.type,
            formula: c.formula,
            isEditable: c.isEditable,
            isSystem: c.isSystem,
            calcMode: c.calcMode as any,
            order: c.order,
          },
          update: {
            name: c.name,
            type: c.type,
            formula: c.formula,
            isEditable: c.isEditable,
            isSystem: c.isSystem,
            calcMode: c.calcMode as any,
            order: c.order,
          },
        })
      }
    }

    // 5. SalaryColumnVersion (upsert by unique (companyId, columnKey, effectiveFrom))
    if (d.salaryColumnVersions) {
      for (const v of d.salaryColumnVersions) {
        await tx.salaryColumnVersion.upsert({
          where: {
            companyId_columnKey_effectiveFrom: {
              companyId,
              columnKey: v.columnKey,
              effectiveFrom: new Date(v.effectiveFrom),
            },
          },
          create: {
            companyId,
            columnKey: v.columnKey,
            name: v.name,
            formula: v.formula,
            type: v.type,
            effectiveFrom: new Date(v.effectiveFrom),
            createdBy: v.createdBy,
          },
          update: {
            name: v.name,
            formula: v.formula,
            type: v.type,
            createdBy: v.createdBy,
          },
        })
      }
    }

    // 6. PITBracket — no unique constraint. Replace-all pattern.
    if (d.pitBrackets) {
      await tx.pITBracket.deleteMany({ where: { companyId } })
      if (d.pitBrackets.length > 0) {
        await tx.pITBracket.createMany({
          data: d.pitBrackets.map(b => ({
            companyId,
            minIncome: b.minIncome,
            maxIncome: b.maxIncome,
            rate: b.rate,
            validFrom: new Date(b.validFrom),
            validTo: b.validTo ? new Date(b.validTo) : null,
          })),
        })
      }
    }

    // 7. InsuranceRate — same replace-all treatment.
    if (d.insuranceRates) {
      await tx.insuranceRate.deleteMany({ where: { companyId } })
      if (d.insuranceRates.length > 0) {
        await tx.insuranceRate.createMany({
          data: d.insuranceRates.map(r => ({
            companyId,
            type: r.type as any,
            employeeRate: r.employeeRate,
            employerRate: r.employerRate,
            validFrom: new Date(r.validFrom),
            validTo: r.validTo ? new Date(r.validTo) : null,
          })),
        })
      }
    }

    // 8. Employee (upsert by unique (companyId, email))
    //    We DO NOT soft-delete or hard-delete employees not in the backup —
    //    only additive/update. If backup skipped someone, leave them alone.
    if (d.employees) {
      for (const e of d.employees) {
        await tx.employee.upsert({
          where: { companyId_email: { companyId, email: e.email } },
          create: {
            companyId,
            code: e.code,
            fullName: e.fullName,
            email: e.email,
            phone: e.phone,
            dob: e.dob ? new Date(e.dob) : null,
            gender: e.gender,
            idCard: e.idCard,
            address: e.address,
            department: e.department,
            position: e.position,
            status: e.status as any,
            contractType: e.contractType as any,
            startDate: new Date(e.startDate),
            endDate: e.endDate ? new Date(e.endDate) : null,
            baseSalary: e.baseSalary,
            responsibilitySalary: e.responsibilitySalary,
            bankAccount: e.bankAccount,
            bankName: e.bankName,
            taxCode: e.taxCode,
            bhxhCode: e.bhxhCode,
            accountStatus: e.accountStatus as any,
          },
          update: {
            code: e.code,
            fullName: e.fullName,
            phone: e.phone,
            dob: e.dob ? new Date(e.dob) : null,
            gender: e.gender,
            idCard: e.idCard,
            address: e.address,
            department: e.department,
            position: e.position,
            status: e.status as any,
            contractType: e.contractType as any,
            startDate: new Date(e.startDate),
            endDate: e.endDate ? new Date(e.endDate) : null,
            baseSalary: e.baseSalary,
            responsibilitySalary: e.responsibilitySalary,
            bankAccount: e.bankAccount,
            bankName: e.bankName,
            taxCode: e.taxCode,
            bhxhCode: e.bhxhCode,
            accountStatus: e.accountStatus as any,
          },
        })
      }
    }

    // 9. User — upsert by email (globally unique). Password is NOT exported
    //    nor overwritten; new users created here will have password=null
    //    (admin must set one manually). employeeId resolved by looking up
    //    Employee via employeeEmail.
    if (d.users) {
      for (const u of d.users) {
        let employeeId: string | null = null
        if (u.employeeEmail) {
          const emp = await tx.employee.findUnique({
            where: { companyId_email: { companyId, email: u.employeeEmail } },
            select: { id: true },
          })
          if (!emp) {
            warnings.push(`User ${u.email}: không tìm thấy nhân viên ${u.employeeEmail} — bỏ qua liên kết`)
          } else {
            employeeId = emp.id
          }
        }
        await tx.user.upsert({
          where: { email: u.email },
          create: {
            email: u.email,
            name: u.name,
            role: u.role,
            permissions: u.permissions,
            companyId,
            employeeId,
            // password left null — admin must set it after restore
          },
          update: {
            name: u.name,
            role: u.role,
            permissions: u.permissions,
            companyId,
            employeeId,
            // DO NOT update password — keep whatever the current row has
          },
        })
      }
    }
  })

  return { sections, warnings }
}

