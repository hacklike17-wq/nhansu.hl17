import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { GeneratePayrollSchema } from "@/lib/schemas/payroll"
import { upsertPayroll } from "@/lib/services/payroll.service"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = (session.user as any).companyId
  const role = (session.user as any).role
  const month = searchParams.get("month") // YYYY-MM

  // Phase 10: employees can only see their own payslip — enforce server-side
  const sessionEmployeeId: string | null = (session.user as any).employeeId ?? null
  const employeeId = role === "employee"
    ? (sessionEmployeeId ?? "__none__")  // force own scope; null employeeId → no results
    : searchParams.get("employeeId")

  let dateFilter = {}
  if (month) {
    const [y, m] = month.split("-").map(Number)
    dateFilter = { month: new Date(Date.UTC(y, m - 1, 1)) }
  }

  const payrolls = await db.payroll.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      ...dateFilter,
    },
    include: {
      employee: { select: { id: true, fullName: true, department: true, position: true } },
    },
    orderBy: [{ month: "desc" }, { employee: { createdAt: "asc" } }],
  })

  // Attach salaryValues for each payroll row so client can render custom columns
  if (payrolls.length > 0) {
    const employeeIds = [...new Set(payrolls.map((p: any) => p.employeeId))]
    const months = [...new Set(payrolls.map((p: any) => (p.month as Date).toISOString()))]
    const allSalaryValues = await db.salaryValue.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        month: { in: months.map(m => new Date(m)) },
      },
    })
    // Group by employeeId+month
    const svMap = new Map<string, any[]>()
    for (const sv of allSalaryValues) {
      const key = `${sv.employeeId}::${(sv.month as Date).toISOString()}`
      if (!svMap.has(key)) svMap.set(key, [])
      svMap.get(key)!.push(sv)
    }
    const enriched = payrolls.map((p: any) => ({
      ...p,
      salaryValues: svMap.get(`${p.employeeId}::${(p.month as Date).toISOString()}`) ?? [],
    }))
    return NextResponse.json(enriched)
  }

  return NextResponse.json(payrolls)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const body = await req.json()

  const parsed = GeneratePayrollSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { month, employeeIds, missingOnly } = parsed.data

  const [y, m] = month.split("-").map(Number)
  const monthDate = new Date(Date.UTC(y, m - 1, 1))

  // Lấy danh sách nhân viên cần tính lương
  let employees = await db.employee.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { in: ["WORKING", "HALF", "REMOTE"] },
      ...(employeeIds ? { id: { in: employeeIds } } : {}),
    },
    select: { id: true },
  })

  // Phase 04: missingOnly — skip employees who already have a payroll for this month
  if (missingOnly) {
    const existing = await db.payroll.findMany({
      where: { companyId, month: monthDate },
      select: { employeeId: true },
    })
    const existingSet = new Set(existing.map((p: any) => p.employeeId))
    employees = employees.filter((e: any) => !existingSet.has(e.id))
  }

  const results = await Promise.allSettled(
    employees.map((e: { id: string }) => upsertPayroll(companyId, e.id, month))
  )

  const succeeded = results.filter((r: any) => r.status === "fulfilled").length
  const failed = results.filter((r: any) => r.status === "rejected").length

  return NextResponse.json(
    { ok: true, succeeded, failed, month },
    { status: 201 }
  )
}
