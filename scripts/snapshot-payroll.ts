// Snapshot script: dump all current payroll numbers to compare before/after refactor
import { db } from "@/lib/db"

async function main() {
  const rows = await db.payroll.findMany({
    orderBy: [{ month: "asc" }, { employeeId: "asc" }],
    select: {
      employeeId: true,
      month: true,
      congSoNhan: true,
      congSoTru: true,
      netWorkUnits: true,
      baseSalary: true,
      workSalary: true,
      responsibilitySalary: true,
      overtimeHours: true,
      overtimePay: true,
      mealPay: true,
      tienPhuCap: true,
      kpiChuyenCan: true,
      tienPhat: true,
      grossSalary: true,
      bhxhEmployee: true,
      bhytEmployee: true,
      bhtnEmployee: true,
      pitTax: true,
      netSalary: true,
      status: true,
    },
  })
  console.log(JSON.stringify(rows, null, 2))
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
