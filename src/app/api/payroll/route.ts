import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { GeneratePayrollSchema } from "@/lib/schemas/payroll"
import { upsertPayroll } from "@/lib/services/payroll.service"
import { requirePermission, errorResponse } from "@/lib/permission"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("luong.view")
    const companyId = ctx.companyId
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month")

    // Employees can only see their own payroll — enforce server-side
    const employeeId = ctx.role === "employee"
      ? (ctx.employeeId ?? "__none__")
      : searchParams.get("employeeId")

    let dateFilter = {}
    if (month) {
      const [y, m] = month.split("-").map(Number)
      dateFilter = { month: new Date(Date.UTC(y, m - 1, 1)) }
    }

    const payrolls = await db.payroll.findMany({
      where: {
        companyId: companyId ?? undefined,
        ...(employeeId ? { employeeId } : {}),
        ...dateFilter,
      },
      include: {
        employee: { select: { id: true, fullName: true, department: true, position: true } },
      },
      orderBy: [{ month: "desc" }, { employee: { createdAt: "asc" } }],
    })

    if (payrolls.length > 0) {
      const employeeIds = [...new Set(payrolls.map((p: any) => p.employeeId))]
      const months = [...new Set(payrolls.map((p: any) => (p.month as Date).toISOString()))]
      const allSalaryValues = await db.salaryValue.findMany({
        where: {
          companyId: companyId ?? undefined,
          employeeId: { in: employeeIds },
          month: { in: months.map(m => new Date(m)) },
        },
      })
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
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("luong.edit")
    const companyId = ctx.companyId!
    const body = await req.json()

    const parsed = GeneratePayrollSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { month, employeeIds, missingOnly } = parsed.data

    const [y, m] = month.split("-").map(Number)
    const monthDate = new Date(Date.UTC(y, m - 1, 1))

    let employees = await db.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["WORKING", "HALF", "REMOTE"] },
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
      },
      select: { id: true },
    })

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

    return NextResponse.json({ ok: true, succeeded, failed, month }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
