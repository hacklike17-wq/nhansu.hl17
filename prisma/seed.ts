/**
 * Prisma Seed — nhansu.hl17
 * Tạo: 1 company, 1 admin user, 5 employees + sample attendance/payroll data
 *
 * Run: npx tsx prisma/seed.ts
 * Guard: throws nếu NODE_ENV === "production"
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

if (process.env.NODE_ENV === "production") {
  throw new Error("Seed không chạy trên production!")
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" })
const db = new PrismaClient({ adapter })

const COMPANY_SEED_ID = "company_hl17_seed"

async function main() {
  console.log("🌱 Bắt đầu seed...")

  // ── Company ──────────────────────────────────────────────────
  // Upsert by taxId → reuse existing row if present, else create with COMPANY_SEED_ID.
  // Downstream rows reference the resolved company.id (not the hardcoded seed id).
  const company = await db.company.upsert({
    where: { taxId: "0123456789" },
    update: {},
    create: {
      id: COMPANY_SEED_ID,
      name: "Công ty TNHH HL17",
      taxId: "0123456789",
      address: "Hà Nội, Việt Nam",
      phone: "0901234567",
      email: "admin@hl17.vn",
      director: "Nguyễn Văn Hoàng",
      bankAccount: "123456789",
      bankName: "Vietcombank",
    },
  })

  const COMPANY_ID = company.id
  console.log(`✓ Company: ${company.name} (${COMPANY_ID})`)

  // ── CompanySettings ──────────────────────────────────────────
  await db.companySettings.upsert({
    where: { companyId: COMPANY_ID },
    update: {},
    create: {
      companyId: COMPANY_ID,
      workHoursPerDay: 8,
      workDaysPerWeek: 5,
      leavePerYear: 12,
    },
  })

  // ── PITBrackets (2025 — 7 bậc) ───────────────────────────────
  const pitBrackets = [
    { min: 0, max: 5_000_000, rate: 0.05 },
    { min: 5_000_000, max: 10_000_000, rate: 0.1 },
    { min: 10_000_000, max: 18_000_000, rate: 0.15 },
    { min: 18_000_000, max: 32_000_000, rate: 0.2 },
    { min: 32_000_000, max: 52_000_000, rate: 0.25 },
    { min: 52_000_000, max: 80_000_000, rate: 0.3 },
    { min: 80_000_000, max: null, rate: 0.35 },
  ]

  for (const b of pitBrackets) {
    await db.pITBracket.create({
      data: {
        companyId: COMPANY_ID,
        minIncome: b.min,
        maxIncome: b.max,
        rate: b.rate,
        validFrom: new Date("2025-01-01"),
      },
    }).catch(() => {}) // ignore duplicate
  }
  console.log(`✓ PITBrackets: ${pitBrackets.length} bậc`)

  // ── InsuranceRates ────────────────────────────────────────────
  const insuranceRates = [
    { type: "BHXH" as const, employeeRate: 0.08, employerRate: 0.175 },
    { type: "BHYT" as const, employeeRate: 0.015, employerRate: 0.03 },
    { type: "BHTN" as const, employeeRate: 0.01, employerRate: 0.01 },
  ]

  for (const r of insuranceRates) {
    await db.insuranceRate.create({
      data: {
        companyId: COMPANY_ID,
        ...r,
        validFrom: new Date("2025-01-01"),
      },
    }).catch(() => {})
  }
  console.log(`✓ InsuranceRates: 3 loại`)

  // ── PermissionGroups ──────────────────────────────────────────
  const groups = [
    {
      name: "admin",
      label: "Quản trị viên",
      description: "Toàn quyền hệ thống",
      permissions: ["*"],
      isSystem: true,
    },
    {
      name: "manager",
      label: "Quản lý",
      description: "Quản lý nhân sự, chấm công, lương, báo cáo",
      permissions: [
        "dashboard.view",
        "nhanvien.view", "nhanvien.edit",
        "chamcong.view", "chamcong.edit",
        "luong.view", "luong.edit",
        "tuyendung.view", "tuyendung.edit",
        "nghiphep.view", "nghiphep.edit",
        "doanhthu.view", "chiphi.view",
        "dongtien.view", "ngansach.view", "congno.view",
        "baocao.view",
      ],
      isSystem: true,
    },
    {
      name: "employee",
      label: "Nhân viên",
      description: "Chỉ xem thông tin cá nhân",
      permissions: [
        "dashboard.view",
        "luong.view",
        "chamcong.view",
        "nghiphep.view", "nghiphep.edit",
      ],
      isSystem: true,
    },
  ]

  // Drop legacy groups from prior seed versions
  await db.permissionGroup.deleteMany({
    where: {
      companyId: COMPANY_ID,
      name: { in: ["boss_admin", "hr_manager", "accountant"] },
    },
  })

  for (const g of groups) {
    await db.permissionGroup.upsert({
      where: { companyId_name: { companyId: COMPANY_ID, name: g.name } },
      update: {
        label: g.label,
        description: g.description,
        permissions: g.permissions,
        isSystem: g.isSystem,
      },
      create: {
        companyId: COMPANY_ID,
        ...g,
      },
    })
  }
  console.log(`✓ PermissionGroups: ${groups.length} nhóm`)

  // Remap legacy User.role values to canonical roles
  const roleRemaps: Array<[string, string]> = [
    ["boss_admin", "admin"],
    ["hr_manager", "manager"],
    ["accountant", "manager"],
  ]
  for (const [from, to] of roleRemaps) {
    await db.user.updateMany({
      where: { companyId: COMPANY_ID, role: from },
      data: { role: to },
    })
  }

  // ── Employees ─────────────────────────────────────────────────
  const employeesData = [
    {
      id: "emp_admin_001",
      fullName: "Nguyễn Văn Admin",
      email: "admin@hl17.vn",
      department: "Ban Giám đốc",
      position: "Giám đốc điều hành",
      contractType: "FULL_TIME" as const,
      baseSalary: 30_000_000,
      role: "admin" as const,
      code: "NV001",
    },
    {
      id: "emp_hr_001",
      fullName: "Trần Thị HR",
      email: "hr@hl17.vn",
      department: "Nhân sự",
      position: "Quản lý nhân sự",
      contractType: "FULL_TIME" as const,
      baseSalary: 20_000_000,
      role: "manager" as const,
      code: "NV002",
    },
    {
      id: "emp_acc_001",
      fullName: "Lê Văn Kế Toán",
      email: "ketoan@hl17.vn",
      department: "Tài chính",
      position: "Kế toán trưởng",
      contractType: "FULL_TIME" as const,
      baseSalary: 18_000_000,
      role: "manager" as const,
      code: "NV003",
    },
    {
      id: "emp_dev_001",
      fullName: "Phạm Thị Dev",
      email: "dev1@hl17.vn",
      department: "Công nghệ",
      position: "Lập trình viên",
      contractType: "FULL_TIME" as const,
      baseSalary: 25_000_000,
      role: "employee" as const,
      code: "NV004",
    },
    {
      id: "emp_dev_002",
      fullName: "Hoàng Văn Intern",
      email: "intern1@hl17.vn",
      department: "Công nghệ",
      position: "Thực tập sinh",
      contractType: "INTERN" as const,
      baseSalary: 5_000_000,
      role: "employee" as const,
      code: "NV005",
    },
  ]

  const hashedPw = await bcrypt.hash("123456", 12)

  for (const e of employeesData) {
    const emp = await db.employee.upsert({
      where: { companyId_email: { companyId: COMPANY_ID, email: e.email } },
      update: { fullName: e.fullName, department: e.department, position: e.position },
      create: {
        id: e.id,
        companyId: COMPANY_ID,
        fullName: e.fullName,
        email: e.email,
        department: e.department,
        position: e.position,
        contractType: e.contractType,
        startDate: new Date("2024-01-01"),
        baseSalary: e.baseSalary,
        code: e.code,
        accountStatus: "ACTIVE",
      },
    })

    // User account
    await db.user.upsert({
      where: { email: e.email },
      update: {},
      create: {
        email: e.email,
        name: e.fullName,
        password: hashedPw,
        role: e.role,
        employeeId: emp.id,
        companyId: COMPANY_ID,
      },
    })
  }
  console.log(`✓ Employees: ${employeesData.length} người`)

  // ── Sample WorkUnits — tháng 4/2026 ──────────────────────────
  const workEmployees = employeesData.slice(0, 4) // 4 nhân viên (bỏ intern)
  const april2026 = {
    year: 2026,
    month: 3, // 0-indexed
    workingDays: [
      1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18,
      21, 22, 23, 24, 25, 28, 29, 30, // 22 ngày công
    ],
  }

  let workUnitCount = 0
  for (const e of workEmployees) {
    for (const day of april2026.workingDays) {
      await db.workUnit.upsert({
        where: {
          employeeId_date: {
            employeeId: e.id,
            date: new Date(Date.UTC(april2026.year, april2026.month, day)),
          },
        },
        update: {},
        create: {
          companyId: COMPANY_ID,
          employeeId: e.id,
          date: new Date(Date.UTC(april2026.year, april2026.month, day)),
          units: 1.0,
        },
      })
      workUnitCount++
    }
  }
  console.log(`✓ WorkUnits: ${workUnitCount} records`)

  // ── Sample Leave Request (đã approved) ────────────────────────
  const devEmployee = employeesData.find((e) => e.id === "emp_dev_001")!
  await db.leaveRequest.upsert({
    where: { id: "leave_001_seed" },
    update: {},
    create: {
      id: "leave_001_seed",
      companyId: COMPANY_ID,
      employeeId: devEmployee.id,
      type: "ANNUAL",
      startDate: new Date("2026-04-03"),
      endDate: new Date("2026-04-04"),
      totalDays: 2,
      reason: "Nghỉ phép cá nhân",
      status: "APPROVED",
      approvedBy: "emp_admin_001",
      approvedAt: new Date("2026-04-01"),
    },
  })
  console.log("✓ LeaveRequest: 1 mẫu approved")

  console.log("\n✅ Seed hoàn tất!")
  console.log("\n📋 Tài khoản mẫu (mật khẩu: 123456):")
  for (const e of employeesData) {
    console.log(`   ${e.role.padEnd(12)} | ${e.email}`)
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed lỗi:", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
