import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { validateFormula, buildDependencyGraph, detectCircular } from "@/lib/formula"
import { SYSTEM_VAR_KEYS, SAMPLE_VARS } from "@/constants/salary"
import { markDraftPayrollsStale, recalculateMonth } from "@/lib/services/payroll.service"
import { requireRole, errorResponse } from "@/lib/permission"

const CalcModeEnum = z.enum(["none", "add_to_net", "subtract_from_net"])

const UpdateColumnSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["number", "formula"]).optional(),
  formula: z.string().nullable().optional(),
  isEditable: z.boolean().optional(),
  calcMode: CalcModeEnum.optional(),
  order: z.number().int().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId!
    const { id } = await params
    const body = await req.json()
    const parsed = UpdateColumnSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const existing = await db.salaryColumn.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (existing.key === "tong_thuc_nhan")
      return NextResponse.json({ error: "Cột 'Tổng thực nhận' được tính tự động, không thể chỉnh sửa" }, { status: 400 })
    if (existing.isSystem) {
      const blocked = Object.keys(parsed.data).filter(k => !["calcMode", "order"].includes(k))
      if (blocked.length > 0)
        return NextResponse.json({ error: "Cột hệ thống chỉ có thể cập nhật 'Tính vào lương'" }, { status: 400 })
    }

    const effectiveType = parsed.data.type ?? (existing.type as string)
    const effectiveFormula = "formula" in parsed.data ? parsed.data.formula : existing.formula

    if (effectiveType === "formula" && effectiveFormula) {
      const allColumns = await db.salaryColumn.findMany({ where: { companyId } })
      const knownVars = [...SYSTEM_VAR_KEYS, ...allColumns.map((c: any) => c.key)]

      const validation = validateFormula(effectiveFormula, knownVars, SAMPLE_VARS)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      const allWithUpdated = allColumns.map((c: any) =>
        c.id === id
          ? { key: c.key, formula: effectiveFormula, type: effectiveType }
          : { key: c.key, formula: c.formula, type: c.type }
      )
      const graph = buildDependencyGraph(allWithUpdated)
      const cycles = detectCircular(graph)
      if (cycles.length > 0) {
        return NextResponse.json(
          { error: `Vòng lặp phụ thuộc: ${cycles[0].join(" → ")}` },
          { status: 400 }
        )
      }
    }

    const col = await db.salaryColumn.update({
      where: { id },
      data: {
        ...parsed.data,
        formula: effectiveType === "formula" ? effectiveFormula : null,
      },
    })

    if (effectiveType === "formula" && effectiveFormula?.trim()) {
      const today = new Date()
      const monthStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))
      await db.salaryColumnVersion.upsert({
        where: { companyId_columnKey_effectiveFrom: { companyId, columnKey: existing.key, effectiveFrom: monthStart } },
        update: { name: col.name, formula: effectiveFormula as string, type: effectiveType },
        create: { companyId, columnKey: existing.key, name: col.name, formula: effectiveFormula as string, type: effectiveType, effectiveFrom: monthStart },
      })
    }

    const calcModeChanged = "calcMode" in parsed.data && parsed.data.calcMode !== (existing as any).calcMode
    if (effectiveType === "formula" || calcModeChanged) {
      const now = new Date()
      await markDraftPayrollsStale(companyId).catch(err =>
        console.warn("markDraftPayrollsStale after updateSalaryColumn failed:", err)
      )
      recalculateMonth(companyId, now).catch(err =>
        console.warn("recalculateMonth after updateSalaryColumn failed:", err)
      )
    }

    return NextResponse.json(col)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId!
    const { id } = await params

    const col = await db.salaryColumn.findFirst({ where: { id, companyId } })
    if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (col.isSystem)
      return NextResponse.json({ error: "Không thể xóa cột hệ thống" }, { status: 400 })

    await db.salaryColumn.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
