// Recalculate every existing payroll using upsertPayroll.
// Non-DRAFT payrolls are skipped by the upsertPayroll guard — they stay frozen.
import { db } from "@/lib/db"
import { upsertPayroll } from "@/lib/services/payroll.service"

async function main() {
  const rows = await db.payroll.findMany({
    select: { employeeId: true, companyId: true, month: true, status: true },
    orderBy: [{ month: "asc" }, { employeeId: "asc" }],
  })

  let ok = 0, skipped = 0, failed = 0
  for (const r of rows) {
    if (r.status !== "DRAFT") { skipped++; continue }
    const d = r.month as Date
    const monthStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    try {
      await upsertPayroll(r.companyId, r.employeeId, monthStr)
      ok++
    } catch (e: any) {
      failed++
      console.error(`FAIL ${r.employeeId}/${monthStr}:`, e?.message ?? e)
    }
  }

  console.error(`Recalculated: ok=${ok} skipped=${skipped} failed=${failed} total=${rows.length}`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
