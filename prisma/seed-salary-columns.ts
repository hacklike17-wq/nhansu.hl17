/**
 * seed-salary-columns.ts — Xóa cột lương cũ và seed cấu hình mẫu mới
 * Run: DATABASE_URL=... npx tsx prisma/seed-salary-columns.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" })
const db = new PrismaClient({ adapter })

const COMPANY_ID = "company_hl17"

/* ── Công thức tính lương ──────────────────────────────────────────
  Quy ước biến built-in:
    luong_co_ban       — lương cơ bản (từ employee.baseSalary)
    luong_trach_nhiem  — lương trách nhiệm (từ employee.responsibilitySalary)
    cong_so            — tổng công số tháng (từ workUnits)
    gio_tang_ca        — tổng giờ tăng ca tháng (từ overtimeEntries)

  Công thức:
    tien_tang_ca  = (luong_co_ban / 26 / 8) * gio_tang_ca * 1.5
    tien_an       = cong_so * 35000
    tong_thuc_nhan = luong_co_ban + luong_trach_nhiem
                   + tien_tang_ca + tien_an + tien_phu_cap
                   - tien_phat - kpi_chuyen_can - kpi_trach_nhiem
─────────────────────────────────────────────────────────────────── */

const COLUMNS = [
  {
    key:        "luong_co_ban",
    name:       "Lương cơ bản",
    type:       "number",
    formula:    null,
    isEditable: false,
    isSystem:   true,
    order:      0,
  },
  {
    key:        "luong_trach_nhiem",
    name:       "Lương trách nhiệm",
    type:       "number",
    formula:    null,
    isEditable: false,
    isSystem:   true,
    order:      1,
  },
  {
    key:        "cong_so",
    name:       "Công số",
    type:       "number",
    formula:    null,
    isEditable: false,
    isSystem:   true,
    order:      2,
  },
  {
    key:        "gio_tang_ca",
    name:       "Giờ tăng ca",
    type:       "number",
    formula:    null,
    isEditable: false,
    isSystem:   true,
    order:      3,
  },
  {
    key:        "tien_tang_ca",
    name:       "Tiền tăng ca",
    type:       "formula",
    // 1 ngày công = 26 ngày/tháng, 1 ngày = 8 tiếng, hệ số OT = 1.5
    formula:    "(luong_co_ban / 26 / 8) * gio_tang_ca * 1.5",
    isEditable: false,
    isSystem:   false,
    order:      4,
  },
  {
    key:        "kpi_chuyen_can",
    name:       "KPI chuyên cần",
    type:       "number",
    formula:    null,
    isEditable: true,
    isSystem:   false,
    order:      5,
  },
  {
    key:        "kpi_trach_nhiem",
    name:       "KPI trách nhiệm",
    type:       "number",
    formula:    null,
    isEditable: true,
    isSystem:   false,
    order:      6,
  },
  {
    key:        "tien_an",
    name:       "Tiền ăn",
    type:       "formula",
    formula:    "cong_so * 35000",
    isEditable: false,
    isSystem:   false,
    order:      7,
  },
  {
    key:        "tien_phu_cap",
    name:       "Tiền phụ cấp",
    type:       "number",
    formula:    null,
    isEditable: true,
    isSystem:   false,
    order:      8,
  },
  {
    key:        "tien_phat",
    name:       "Tiền phạt",
    type:       "number",
    formula:    null,
    isEditable: true,
    isSystem:   false,
    order:      9,
  },
  {
    key:        "tong_thuc_nhan",
    name:       "Tổng thực nhận",
    type:       "formula",
    formula:    "luong_co_ban + luong_trach_nhiem + tien_tang_ca + tien_an + tien_phu_cap - tien_phat - kpi_chuyen_can - kpi_trach_nhiem",
    isEditable: false,
    isSystem:   true,
    order:      10,
  },
]

async function main() {
  console.log("🗑️  Xóa cột lương cũ của company_hl17...")
  await db.salaryColumn.deleteMany({ where: { companyId: COMPANY_ID } })
  console.log("✓ Xóa xong\n")

  console.log("🌱 Tạo cấu hình cột lương mới...")
  for (const col of COLUMNS) {
    await db.salaryColumn.create({
      data: { companyId: COMPANY_ID, ...col },
    })
    const badge = col.type === "formula" ? `[formula: ${col.formula}]` : `[số]`
    console.log(`  ✓ ${col.name.padEnd(22)} ${badge}`)
  }

  console.log(`\n✅ Hoàn tất! ${COLUMNS.length} cột lương đã được tạo.`)
}

main()
  .catch(e => { console.error("❌ Lỗi:", e); process.exit(1) })
  .finally(() => db.$disconnect())
