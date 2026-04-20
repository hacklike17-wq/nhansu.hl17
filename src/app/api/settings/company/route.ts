import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { z } from "zod"
import { markDraftPayrollsStale, recalculateMonth } from "@/lib/services/payroll.service"
import { requirePermission, requireRole, errorResponse } from "@/lib/permission"

const UpdateSchema = z.object({
  enableInsuranceTax: z.boolean(),
})

/**
 * GET returns only the insurance-tax flag used by /luong to render net
 * salary. Gated by `dashboard.view` so every logged-in role (admin, manager,
 * employee) can read but unauthenticated cannot. The tight `select` clause
 * prevents accidental field leaks if CompanySettings grows more sensitive
 * columns (vd sheetUrl, API keys) — if you add fields, DO NOT widen this
 * select without updating the permission check.
 */
export async function GET() {
  try {
    const ctx = await requirePermission("dashboard.view")
    const settings = await db.companySettings.findUnique({
      where: { companyId: ctx.companyId ?? "" },
      select: { enableInsuranceTax: true },
    })
    return NextResponse.json({
      enableInsuranceTax: settings?.enableInsuranceTax ?? true,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const companyId = ctx.companyId!
    const body = await req.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { enableInsuranceTax } = parsed.data

    await db.companySettings.upsert({
      where: { companyId },
      update: { enableInsuranceTax },
      create: { companyId, enableInsuranceTax },
    })

    const now = new Date()
    await markDraftPayrollsStale(companyId).catch(err =>
      console.warn("markDraftPayrollsStale after enableInsuranceTax toggle:", err)
    )
    recalculateMonth(companyId, now).catch(err =>
      console.warn("recalculateMonth after enableInsuranceTax toggle:", err)
    )

    return NextResponse.json({ ok: true, enableInsuranceTax })
  } catch (e) {
    return errorResponse(e)
  }
}
