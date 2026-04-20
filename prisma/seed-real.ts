/**
 * seed-real.ts — Xóa toàn bộ dữ liệu cũ và seed lại với nhân viên thật
 * Run: DATABASE_URL=... npx tsx prisma/seed-real.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" })
const db = new PrismaClient({ adapter })

const COMPANY_ID = "company_hl17"

async function main() {
  console.log("🗑️  Xóa dữ liệu cũ...")

  // Xóa theo thứ tự (con trước cha)
  await db.auditLog.deleteMany()
  await db.salaryValue.deleteMany()
  await db.salaryColumn.deleteMany()
  await db.payroll.deleteMany()
  await db.kpiViolation.deleteMany()
  await db.overtimeEntry.deleteMany()
  await db.deductionEvent.deleteMany()
  await db.leaveRequest.deleteMany()
  await db.workUnit.deleteMany()
  await db.revenueRecord.deleteMany()
  await db.expenseRecord.deleteMany()
  await db.budgetRecord.deleteMany()
  await db.debtRecord.deleteMany()
  await db.session.deleteMany()
  await db.account.deleteMany()
  await db.verificationToken.deleteMany()
  await db.user.deleteMany()
  await db.employee.deleteMany()
  await db.pITBracket.deleteMany()
  await db.insuranceRate.deleteMany()
  await db.permissionGroup.deleteMany()
  await db.companySettings.deleteMany()
  await db.company.deleteMany()

  console.log("✓ Xóa xong\n")
  console.log("🌱 Tạo dữ liệu mới...")

  // ── Company ───────────────────────────────────────────────────
  await db.company.create({
    data: {
      id: COMPANY_ID,
      name: "Công ty TNHH HL17",
      taxId: "0123456789",
      address: "Hà Nội, Việt Nam",
      phone: "0928976666",
      email: "hoahenry1803@gmail.com",
      director: "Văn Hoà Nguyễn",
    },
  })

  await db.companySettings.create({
    data: {
      companyId: COMPANY_ID,
      workHoursPerDay: 8,
      workDaysPerWeek: 5,
      leavePerYear: 12,
    },
  })
  console.log("✓ Company + Settings")

  // ── PITBrackets ───────────────────────────────────────────────
  const pitBrackets = [
    { min: 0,          max: 5_000_000,  rate: 0.05 },
    { min: 5_000_000,  max: 10_000_000, rate: 0.10 },
    { min: 10_000_000, max: 18_000_000, rate: 0.15 },
    { min: 18_000_000, max: 32_000_000, rate: 0.20 },
    { min: 32_000_000, max: 52_000_000, rate: 0.25 },
    { min: 52_000_000, max: 80_000_000, rate: 0.30 },
    { min: 80_000_000, max: null,        rate: 0.35 },
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
    })
  }
  console.log("✓ PITBrackets: 7 bậc")

  // ── InsuranceRates ────────────────────────────────────────────
  const insuranceRates = [
    { type: "BHXH" as const, employeeRate: 0.08,  employerRate: 0.175 },
    { type: "BHYT" as const, employeeRate: 0.015, employerRate: 0.03  },
    { type: "BHTN" as const, employeeRate: 0.01,  employerRate: 0.01  },
  ]
  for (const r of insuranceRates) {
    await db.insuranceRate.create({
      data: { companyId: COMPANY_ID, ...r, validFrom: new Date("2025-01-01") },
    })
  }
  console.log("✓ InsuranceRates: 3 loại")

  // ── PermissionGroups ──────────────────────────────────────────
  const groups = [
    { name: "boss_admin", label: "Boss Admin",      permissions: ["*"],                  isSystem: true },
    { name: "admin",      label: "Quản trị viên",   permissions: [
        "dashboard.view","nhanvien.view","nhanvien.edit","nhanvien.delete",
        "chamcong.view","chamcong.edit","chamcong.config",
        "luong.view","luong.edit","luong.config",
        "tuyendung.view","tuyendung.edit",
        "nghiphep.view","nghiphep.edit","nghiphep.approve",
        "doanhthu.view","chiphi.view","dongtien.view","ngansach.view","congno.view",
        "baocao.view","baocao.export",
        "phanquyen.view","phanquyen.edit",
        "caidat.view","caidat.edit","caidat.config",
      ], isSystem: true },
    { name: "hr_manager",  label: "QL Nhân sự",     permissions: [
        "dashboard.view","nhanvien.view","nhanvien.edit",
        "chamcong.view","chamcong.edit","luong.view","luong.edit",
        "tuyendung.view","tuyendung.edit",
        "nghiphep.view","nghiphep.edit","nghiphep.approve",
        "doanhthu.view","chiphi.view","baocao.view","baocao.export",
      ], isSystem: true },
    { name: "accountant",  label: "Kế toán",        permissions: [
        "dashboard.view","nhanvien.view","chamcong.view",
        "luong.view","luong.edit",
        "doanhthu.view","doanhthu.edit","chiphi.view","chiphi.edit","chiphi.approve",
        "dongtien.view","ngansach.view","ngansach.edit","congno.view",
        "baocao.view","baocao.export",
      ], isSystem: true },
    { name: "employee",    label: "Nhân viên",      permissions: [
        "dashboard.view","nhanvien.view","chamcong.view","luong.view","nghiphep.view",
      ], isSystem: true },
  ]
  for (const g of groups) {
    await db.permissionGroup.create({
      data: { companyId: COMPANY_ID, ...g, description: g.label },
    })
  }
  console.log("✓ PermissionGroups: 5 nhóm")

  // ── Employees + Users ─────────────────────────────────────────
  // Mật khẩu mặc định: [ten_ascii]@123
  const employees = [
    {
      code: "NV001",
      fullName: "Văn Hoà Nguyễn",
      email: "hoahenry1803@gmail.com",
      phone: "0928976666",
      gender: "Nam",
      dob: null,
      address: null,
      role: "boss_admin",
      password: "hoa@123",
    },
    {
      code: "NV011",
      fullName: "Đào Trọng Phụng",
      email: "daotrongphung260601@gmail.com",
      phone: "0346744743",
      gender: "Nam",
      dob: new Date("2001-06-26"),
      address: "Quỳnh Phụ, Thái Bình",
      role: "employee",
      password: "phung@123",
    },
    {
      code: "NV009",
      fullName: "Bùi Minh Phượng",
      email: "bmdat2021@gmail.com",
      phone: "0973110786",
      gender: "Nữ",
      dob: new Date("1987-11-20"),
      address: "Số 21 Ngõ 43/12 Cầu Cốc",
      role: "employee",
      password: "phuong@123",
    },
    {
      code: "NV006",
      fullName: "Phạm Đình Quân",
      email: "annquanidol9009@gmail.com",
      phone: "0978267283",
      gender: "Nam",
      dob: new Date("1997-09-05"),
      address: "Hưng Hà, Thái Bình",
      role: "employee",
      password: "quan@123",
    },
    {
      code: "NV004",
      fullName: "Nguyễn Duy Dương",
      email: "nguyenduong1996tb@gmail.com",
      phone: "0967188711",
      gender: "Nam",
      dob: new Date("1996-02-28"),
      address: "Hưng Hà, Thái Bình",
      role: "employee",
      password: "duong@123",
    },
    {
      code: "NV002",
      fullName: "Nguyễn Trường Giang",
      email: "gianghugl0212@gmail.com",
      phone: "0866657532",
      gender: "Nam",
      dob: new Date("2005-12-02"),
      address: "Nam Từ Liêm, Hà Nội",
      role: "employee",
      password: "giang@123",
    },
    {
      code: "NV003",
      fullName: "Nguyễn Mạnh Tiến",
      email: "nguyenmanhtien.dvfb.93@gmail.com",
      phone: "0826131366",
      gender: "Nam",
      dob: new Date("1993-06-03"),
      address: "Nam Từ Liêm, Hà Nội",
      role: "employee",
      password: "tien@123",
    },
    {
      code: "NV008",
      fullName: "Nguyễn Văn Tuấn",
      email: "tuannvarena@gmail.com",
      phone: "0869762258",
      gender: "Nam",
      dob: new Date("2000-11-24"),
      address: "Hưng Hà, Thái Bình",
      role: "employee",
      password: "tuan@123",
    },
  ]

  for (const e of employees) {
    const hashed = await bcrypt.hash(e.password, 12)

    const emp = await db.employee.create({
      data: {
        companyId: COMPANY_ID,
        code: e.code,
        fullName: e.fullName,
        email: e.email,
        phone: e.phone,
        gender: e.gender,
        dob: e.dob,
        address: e.address,
        department: "Chưa phân công",
        position: "Nhân viên",
        contractType: "FULL_TIME",
        startDate: new Date("2024-01-01"),
        baseSalary: 0,
        accountStatus: "ACTIVE",
      },
    })

    await db.user.create({
      data: {
        email: e.email,
        name: e.fullName,
        password: hashed,
        role: e.role,
        employeeId: emp.id,
        companyId: COMPANY_ID,
      },
    })

    console.log(`  ✓ ${e.fullName.padEnd(25)} [${e.role}]`)
  }

  console.log(`\n✅ Hoàn tất! ${employees.length} nhân viên đã được tạo.`)
  console.log("\n📋 Tài khoản đăng nhập (mật khẩu: xem hằng số trong seed-real.ts):")
  for (const e of employees) {
    console.log(`   ${e.email}`)
  }
  console.log("\n⚠️  KHÔNG dùng seed-real.ts trên VPS production — chỉ để dev/test seed.")
}

main()
  .catch((e) => { console.error("❌ Lỗi:", e); process.exit(1) })
  .finally(() => db.$disconnect())
