/**
 * sync-codes-with-sheet.ts — one-off: cập nhật Employee.code cho khớp với
 * Google Sheet "Bảng chấm công" của khách hàng.
 *
 * Anchor: email (stable). Update in-place; không có unique constraint trên
 * `code` nên swap an toàn. Run trong 1 transaction để nếu lỗi thì rollback.
 *
 * Usage:  npx tsx scripts/sync-codes-with-sheet.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" })
const db = new PrismaClient({ adapter })

const mapping: Array<{ email: string; newCode: string; fullName: string }> = [
  { email: "hoahenry1803@gmail.com",           newCode: "NV001", fullName: "Văn Hoà Nguyễn" },
  { email: "daotrongphung260601@gmail.com",    newCode: "NV011", fullName: "Đào Trọng Phụng" },
  { email: "bmdat2021@gmail.com",              newCode: "NV009", fullName: "Bùi Minh Phượng" },
  { email: "annquanidol9009@gmail.com",        newCode: "NV006", fullName: "Phạm Đình Quân" },
  { email: "nguyenduong1996tb@gmail.com",      newCode: "NV004", fullName: "Nguyễn Duy Dương" },
  { email: "gianghugl0212@gmail.com",          newCode: "NV002", fullName: "Nguyễn Trường Giang" },
  { email: "nguyenmanhtien.dvfb.93@gmail.com", newCode: "NV003", fullName: "Nguyễn Mạnh Tiến" },
  { email: "tuannvarena@gmail.com",            newCode: "NV008", fullName: "Nguyễn Văn Tuấn" },
]

async function main() {
  console.log("📋 Trạng thái hiện tại:")
  const before = await db.employee.findMany({
    where: { email: { in: mapping.map(m => m.email) } },
    select: { email: true, code: true, fullName: true },
  })
  for (const e of before) {
    console.log(`   ${e.code?.padEnd(6)} | ${e.fullName.padEnd(25)} | ${e.email}`)
  }

  console.log("\n🔄 Cập nhật...")
  let changed = 0
  let unchanged = 0
  let missing = 0

  await db.$transaction(async tx => {
    for (const m of mapping) {
      const emp = await tx.employee.findFirst({ where: { email: m.email } })
      if (!emp) {
        console.log(`   ⚠️  Không tìm thấy: ${m.email}`)
        missing++
        continue
      }
      if (emp.code === m.newCode) {
        unchanged++
        continue
      }
      await tx.employee.update({
        where: { id: emp.id },
        data: { code: m.newCode },
      })
      console.log(`   ✓ ${emp.code?.padEnd(6)} → ${m.newCode} | ${m.fullName}`)
      changed++
    }
  })

  console.log(`\n📊 Kết quả: đổi ${changed}, giữ nguyên ${unchanged}, không tìm thấy ${missing}`)

  console.log("\n📋 Trạng thái sau:")
  const after = await db.employee.findMany({
    where: { email: { in: mapping.map(m => m.email) } },
    orderBy: { code: "asc" },
    select: { email: true, code: true, fullName: true },
  })
  for (const e of after) {
    console.log(`   ${e.code?.padEnd(6)} | ${e.fullName.padEnd(25)} | ${e.email}`)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
