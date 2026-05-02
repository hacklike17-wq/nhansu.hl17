/**
 * One-off cleanup: xoá data tồn của các Employee có excludeFromPayroll=true.
 *
 * Lý do: trước khi cờ excludeFromPayroll được thêm, admin/giám đốc đã có
 * sẵn vài Payroll DRAFT, SalaryValue, KpiViolation, etc. trong DB. Sau khi
 * bật toggle, mọi UI/aggregate đã filter ra không hiện nữa, nhưng data vẫn
 * còn nằm trong DB — clutter. Script này dọn cho sạch.
 *
 * SAFE: chỉ xoá data của NV có excludeFromPayroll=true. NV khác không động.
 * NEVER xoá Employee record bản thân — chỉ xoá data phụ thuộc.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/cleanup-excluded-employee-data.ts          # PREVIEW
 *   npx tsx --env-file=.env scripts/cleanup-excluded-employee-data.ts --commit # DELETE
 */
import { db } from "@/lib/db"

const COMMIT = process.argv.includes("--commit")

async function main() {
  console.log(COMMIT ? "🔴 COMMIT MODE — sẽ XOÁ dữ liệu" : "🟢 DRY-RUN — chỉ preview, không xoá\n")

  const excludedEmps = await db.employee.findMany({
    where: { excludeFromPayroll: true },
    select: { id: true, fullName: true, email: true, code: true },
  })

  if (excludedEmps.length === 0) {
    console.log("Không có nhân viên nào với excludeFromPayroll=true. Không có gì để dọn.")
    return
  }

  console.log(`Tìm thấy ${excludedEmps.length} NV bị loại khỏi quy trình lương:`)
  for (const e of excludedEmps) {
    console.log(`  - ${e.fullName} (${e.code ?? "no-code"}) — ${e.email}`)
  }
  console.log()

  const empIds = excludedEmps.map(e => e.id)

  // Đếm các record liên quan TRƯỚC khi xoá
  const [payrolls, salaryValues, kpiViolations, workUnits, deductions, leaveRequests, overtimeEntries] =
    await Promise.all([
      db.payroll.findMany({
        where: { employeeId: { in: empIds } },
        select: { id: true, month: true, status: true, netSalary: true, employee: { select: { fullName: true } } },
      }),
      db.salaryValue.findMany({
        where: { employeeId: { in: empIds } },
        select: { id: true, columnKey: true, value: true, month: true, employee: { select: { fullName: true } } },
      }),
      db.kpiViolation.findMany({
        where: { employeeId: { in: empIds } },
        select: { id: true, date: true, types: true, source: true, employee: { select: { fullName: true } } },
      }),
      db.workUnit.findMany({
        where: { employeeId: { in: empIds } },
        select: { id: true, date: true, units: true, source: true, employee: { select: { fullName: true } } },
      }),
      db.deductionEvent.findMany({
        where: { employeeId: { in: empIds } },
        select: { id: true, date: true, type: true, delta: true, status: true, employee: { select: { fullName: true } } },
      }),
      db.leaveRequest.findMany({
        where: { employeeId: { in: empIds } },
        select: { id: true, type: true, startDate: true, endDate: true, status: true, employee: { select: { fullName: true } } },
      }),
      db.overtimeEntry.findMany({
        where: { employeeId: { in: empIds } },
        select: { id: true, date: true, hours: true, employee: { select: { fullName: true } } },
      }),
    ])

  console.log("Records sẽ bị xoá:")
  console.log(`  Payrolls         : ${payrolls.length}`)
  for (const p of payrolls) {
    console.log(`    · ${p.employee.fullName} | ${p.month.toISOString().slice(0, 7)} | ${p.status} | net=${p.netSalary}`)
  }
  console.log(`  SalaryValues     : ${salaryValues.length}`)
  for (const sv of salaryValues) {
    console.log(`    · ${sv.employee.fullName} | ${sv.month.toISOString().slice(0, 7)} | ${sv.columnKey} | ${sv.value}`)
  }
  console.log(`  KpiViolations    : ${kpiViolations.length}`)
  for (const k of kpiViolations) {
    console.log(`    · ${k.employee.fullName} | ${k.date.toISOString().slice(0, 10)} | [${k.types.join(",")}] | ${k.source}`)
  }
  console.log(`  WorkUnits        : ${workUnits.length}`)
  for (const w of workUnits.slice(0, 10)) {
    console.log(`    · ${w.employee.fullName} | ${w.date.toISOString().slice(0, 10)} | units=${w.units} | ${w.source}`)
  }
  if (workUnits.length > 10) console.log(`    · ...và ${workUnits.length - 10} dòng khác`)
  console.log(`  DeductionEvents  : ${deductions.length}`)
  for (const d of deductions) {
    console.log(`    · ${d.employee.fullName} | ${d.date.toISOString().slice(0, 10)} | ${d.type} | delta=${d.delta} | ${d.status}`)
  }
  console.log(`  LeaveRequests    : ${leaveRequests.length}`)
  for (const lr of leaveRequests) {
    console.log(`    · ${lr.employee.fullName} | ${lr.type} | ${lr.startDate.toISOString().slice(0, 10)} → ${lr.endDate.toISOString().slice(0, 10)} | ${lr.status}`)
  }
  console.log(`  OvertimeEntries  : ${overtimeEntries.length}`)
  for (const o of overtimeEntries) {
    console.log(`    · ${o.employee.fullName} | ${o.date.toISOString().slice(0, 10)} | hours=${o.hours}`)
  }
  console.log()

  const total =
    payrolls.length +
    salaryValues.length +
    kpiViolations.length +
    workUnits.length +
    deductions.length +
    leaveRequests.length +
    overtimeEntries.length

  if (total === 0) {
    console.log("Không có record nào để xoá.")
    return
  }

  if (!COMMIT) {
    console.log(`📋 Tổng: ${total} record sẽ bị xoá. Chạy lại với --commit để thực sự xoá.`)
    return
  }

  // Transaction để rollback nếu lỗi
  console.log("Đang xoá trong transaction...")
  const result = await db.$transaction(async tx => {
    // SalaryValueEntry là child của SalaryValue (onDelete:Cascade) → tự xoá
    // DeductionEvent có FK tới LeaveRequest, nên xoá LeaveRequest sẽ break.
    // → Xoá DeductionEvent trước, rồi LeaveRequest.
    const sv = await tx.salaryValue.deleteMany({ where: { employeeId: { in: empIds } } })
    const kv = await tx.kpiViolation.deleteMany({ where: { employeeId: { in: empIds } } })
    const wu = await tx.workUnit.deleteMany({ where: { employeeId: { in: empIds } } })
    const de = await tx.deductionEvent.deleteMany({ where: { employeeId: { in: empIds } } })
    const lr = await tx.leaveRequest.deleteMany({ where: { employeeId: { in: empIds } } })
    const ot = await tx.overtimeEntry.deleteMany({ where: { employeeId: { in: empIds } } })
    const pr = await tx.payroll.deleteMany({ where: { employeeId: { in: empIds } } })
    return { sv, kv, wu, de, lr, ot, pr }
  })

  console.log("✅ Xoá thành công:")
  console.log(`  Payrolls         : ${result.pr.count}`)
  console.log(`  SalaryValues     : ${result.sv.count}`)
  console.log(`  KpiViolations    : ${result.kv.count}`)
  console.log(`  WorkUnits        : ${result.wu.count}`)
  console.log(`  DeductionEvents  : ${result.de.count}`)
  console.log(`  LeaveRequests    : ${result.lr.count}`)
  console.log(`  OvertimeEntries  : ${result.ot.count}`)
}

main()
  .catch(e => {
    console.error("❌ Lỗi:", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
