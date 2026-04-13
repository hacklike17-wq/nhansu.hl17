import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { validateFormula, buildDependencyGraph, detectCircular } from "@/lib/formula"
import { SYSTEM_VAR_KEYS, RESERVED_VARS, SAMPLE_VARS } from "@/constants/salary"
import { markDraftPayrollsStale, recalculateMonth } from "@/lib/services/payroll.service"

const CalcModeEnum = z.enum(["none", "add_to_net", "subtract_from_net"])

const CreateColumnSchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
  type: z.enum(["number", "formula"]).default("number"),
  formula: z.string().optional().nullable(),
  isEditable: z.boolean().default(true),
  calcMode: CalcModeEnum.default("none"),
  order: z.number().int().default(0),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const columns = await db.salaryColumn.findMany({
    where: { companyId },
    orderBy: { order: "asc" },
  })
  return NextResponse.json(columns)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const companyId = (session.user as any).companyId
  const body = await req.json()
  const parsed = CreateColumnSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { key, name, type, formula, isEditable, calcMode, order } = parsed.data
  const normalizedKey = key.replace(/\s+/g, "_").toLowerCase()

  // Phase 02: Guard reserved variable names
  if (RESERVED_VARS.has(normalizedKey)) {
    return NextResponse.json(
      { error: `Tên biến '${normalizedKey}' là biến hệ thống, không thể dùng làm tên cột` },
      { status: 400 }
    )
  }

  if (type === "formula") {
    if (!formula?.trim()) {
      return NextResponse.json({ error: "Cột formula phải có công thức" }, { status: 400 })
    }

    // Get all existing columns for this company (for known vars list)
    const allColumns = await db.salaryColumn.findMany({ where: { companyId } })
    const knownVars = [...SYSTEM_VAR_KEYS, ...allColumns.map((c: any) => c.key)]

    // 1. Validate syntax + unknown vars
    const validation = validateFormula(formula, knownVars, SAMPLE_VARS)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // 2. Detect circular dependency (include current column being created)
    const allWithNew = [
      ...allColumns.map((c: any) => ({ key: c.key, formula: c.formula, type: c.type })),
      { key: normalizedKey, formula, type },
    ]
    const graph = buildDependencyGraph(allWithNew)
    const cycles = detectCircular(graph)
    if (cycles.length > 0) {
      return NextResponse.json(
        { error: `Vòng lặp phụ thuộc: ${cycles[0].join(" → ")}` },
        { status: 400 }
      )
    }
  }

  const col = await db.salaryColumn.create({
    data: {
      companyId,
      name,
      key: normalizedKey,
      type,
      formula: type === "formula" ? (formula ?? null) : null,
      isEditable,
      calcMode,
      order,
    },
  })

  // Phase 08: create version snapshot for formula columns
  if (type === "formula" && formula?.trim()) {
    const today = new Date()
    const monthStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))
    await db.salaryColumnVersion.upsert({
      where: { companyId_columnKey_effectiveFrom: { companyId, columnKey: normalizedKey, effectiveFrom: monthStart } },
      update: { name, formula, type },
      create: { companyId, columnKey: normalizedKey, name, formula, type, effectiveFrom: monthStart },
    })
  }

  // Phase 03b: formula or calcMode change → mark DRAFT payrolls stale + recalc current month
  if (type === "formula" || calcMode !== "none") {
    const now = new Date()
    await markDraftPayrollsStale(companyId).catch(err =>
      console.warn("markDraftPayrollsStale after createSalaryColumn failed:", err)
    )
    recalculateMonth(companyId, now).catch(err =>
      console.warn("recalculateMonth after saveSalaryColumn failed:", err)
    )
  }

  return NextResponse.json(col, { status: 201 })
}
