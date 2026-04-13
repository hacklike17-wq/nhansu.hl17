import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { validateFormula, buildDependencyGraph, detectCircular } from "@/lib/formula"
import { SYSTEM_VAR_KEYS, RESERVED_VARS, SAMPLE_VARS } from "@/constants/salary"
import { markDraftPayrollsStale, recalculateMonth } from "@/lib/services/payroll.service"
import { requireSession, requireRole, errorResponse } from "@/lib/permission"

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
  try {
    const ctx = await requireSession()
    const columns = await db.salaryColumn.findMany({
      where: { companyId: ctx.companyId ?? undefined },
      orderBy: { order: "asc" },
    })
    return NextResponse.json(columns)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId!
    const body = await req.json()
    const parsed = CreateColumnSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { key, name, type, formula, isEditable, calcMode, order } = parsed.data
    const normalizedKey = key.replace(/\s+/g, "_").toLowerCase()

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

      const allColumns = await db.salaryColumn.findMany({ where: { companyId } })
      const knownVars = [...SYSTEM_VAR_KEYS, ...allColumns.map((c: any) => c.key)]

      const validation = validateFormula(formula, knownVars, SAMPLE_VARS)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

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

    if (type === "formula" && formula?.trim()) {
      const today = new Date()
      const monthStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))
      await db.salaryColumnVersion.upsert({
        where: { companyId_columnKey_effectiveFrom: { companyId, columnKey: normalizedKey, effectiveFrom: monthStart } },
        update: { name, formula, type },
        create: { companyId, columnKey: normalizedKey, name, formula, type, effectiveFrom: monthStart },
      })
    }

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
  } catch (e) {
    return errorResponse(e)
  }
}
