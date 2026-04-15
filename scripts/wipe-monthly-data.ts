/**
 * wipe-monthly-data.ts — reset monthly / transactional data so the admin can
 * re-test attendance + payroll flows on a clean slate.
 *
 * KEEPS (setup / config — re-creating these would be painful):
 *   - Company, CompanySettings
 *   - User, Account, Session, VerificationToken
 *   - Employee
 *   - SalaryColumn, SalaryColumnVersion
 *   - PITBracket, InsuranceRate, PermissionGroup
 *   - AiConfig (API key + limits)
 *
 * WIPES (all months, scoped to COMPANY_ID):
 *   - Chấm công:  WorkUnit, OvertimeEntry, KpiViolation
 *   - Nghỉ phép:  LeaveRequest + DeductionEvent
 *   - Lương:      Payroll, SalaryValue, SalaryValueEntry
 *   - Audit:      AuditLog (company-scoped)
 *   - Finance:    RevenueRecord, ExpenseRecord, BudgetRecord, DebtRecord
 *   - AI logs:    AiConversation, AiMessage, AiUsageLog
 *
 * Usage:
 *   Dry-run (chỉ in số bản ghi, không xoá):
 *     npx tsx scripts/wipe-monthly-data.ts
 *
 *   Xoá thật:
 *     npx tsx scripts/wipe-monthly-data.ts --yes
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const COMPANY_ID = "company_hl17"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" })
const db = new PrismaClient({ adapter })

const YES = process.argv.includes("--yes")

async function main() {
  const company = await db.company.findUnique({ where: { id: COMPANY_ID } })
  if (!company) {
    console.error(`❌ Không tìm thấy company id="${COMPANY_ID}"`)
    process.exit(1)
  }
  console.log(`🏢 Công ty: ${company.name} (${COMPANY_ID})`)
  console.log(YES ? "🔥 Chế độ: XOÁ THẬT" : "👀 Chế độ: DRY-RUN (thêm --yes để xoá)")
  console.log("")

  // Count everything first — gives the user a clear "before" picture regardless
  // of dry-run vs live. Audit logs may not have a companyId on a few legacy
  // rows, but .count() with where: { companyId } is what /api routes enforce
  // everywhere else, so we stay consistent.
  const cScope = { where: { companyId: COMPANY_ID } }
  const counts = {
    workUnit:          await db.workUnit.count(cScope),
    overtimeEntry:     await db.overtimeEntry.count(cScope),
    kpiViolation:      await db.kpiViolation.count(cScope),
    leaveRequest:      await db.leaveRequest.count(cScope),
    deductionEvent:    await db.deductionEvent.count(cScope),
    payroll:           await db.payroll.count(cScope),
    salaryValue:       await db.salaryValue.count(cScope),
    // SalaryValueEntry has no companyId column — count via join
    salaryValueEntry:  await db.salaryValueEntry.count({
                          where: { salaryValue: { companyId: COMPANY_ID } },
                        }),
    auditLog:          await db.auditLog.count(cScope),
    revenueRecord:     await db.revenueRecord.count(cScope),
    expenseRecord:     await db.expenseRecord.count(cScope),
    budgetRecord:      await db.budgetRecord.count(cScope),
    debtRecord:        await db.debtRecord.count(cScope),
    aiConversation:    await db.aiConversation.count(cScope),
    // AiMessage has no companyId — count via conversation join
    aiMessage:         await db.aiMessage.count({
                          where: { conversation: { companyId: COMPANY_ID } },
                        }),
    aiUsageLog:        await db.aiUsageLog.count(cScope),
  }

  console.log("📊 Bản ghi sẽ bị xoá:")
  for (const [k, v] of Object.entries(counts)) {
    console.log(`   ${k.padEnd(18)} ${String(v).padStart(6)}`)
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  console.log(`   ${"─".repeat(26)}`)
  console.log(`   ${"TỔNG".padEnd(18)} ${String(total).padStart(6)}`)
  console.log("")

  if (!YES) {
    console.log("👉 Dry-run xong. Chạy lại với --yes để xoá thật.")
    await db.$disconnect()
    return
  }

  if (total === 0) {
    console.log("✅ Không có bản ghi nào để xoá.")
    await db.$disconnect()
    return
  }

  // All-or-nothing: one transaction, so a mid-flight FK failure rolls
  // everything back instead of leaving the DB half-wiped.
  console.log("🔥 Đang xoá...")
  await db.$transaction(async tx => {
    // Order matters — children before parents to respect FK constraints.
    // SalaryValueEntry cascades from SalaryValue, but explicit is safer.
    await tx.salaryValueEntry.deleteMany({
      where: { salaryValue: { companyId: COMPANY_ID } },
    })
    await tx.salaryValue.deleteMany(cScope)
    await tx.payroll.deleteMany(cScope)

    // DeductionEvent FK → LeaveRequest → must delete dedevents first.
    await tx.deductionEvent.deleteMany(cScope)
    await tx.leaveRequest.deleteMany(cScope)

    await tx.workUnit.deleteMany(cScope)
    await tx.overtimeEntry.deleteMany(cScope)
    await tx.kpiViolation.deleteMany(cScope)

    // AiMessage cascades from AiConversation, but explicit is safer.
    await tx.aiMessage.deleteMany({
      where: { conversation: { companyId: COMPANY_ID } },
    })
    await tx.aiConversation.deleteMany(cScope)
    await tx.aiUsageLog.deleteMany(cScope)

    await tx.revenueRecord.deleteMany(cScope)
    await tx.expenseRecord.deleteMany(cScope)
    await tx.budgetRecord.deleteMany(cScope)
    await tx.debtRecord.deleteMany(cScope)

    // Audit last — we want the audit trail up until the very end.
    await tx.auditLog.deleteMany(cScope)
  })

  console.log(`✅ Đã xoá ${total} bản ghi.`)
  console.log("")
  console.log("Còn lại (nguyên vẹn):")
  console.log(`   employees       ${await db.employee.count(cScope)}`)
  console.log(`   users           ${await db.user.count()}`)
  console.log(`   salaryColumns   ${await db.salaryColumn.count(cScope)}`)
  console.log(`   pitBrackets     ${await db.pITBracket.count(cScope)}`)
  console.log(`   insuranceRates  ${await db.insuranceRate.count(cScope)}`)

  await db.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
