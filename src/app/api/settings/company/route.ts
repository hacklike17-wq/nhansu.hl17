import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { markDraftPayrollsStale, recalculateMonth } from "@/lib/services/payroll.service"

const UpdateSchema = z.object({
  enableInsuranceTax: z.boolean(),
})

/**
 * GET /api/settings/company
 * Returns company-level settings for the logged-in user's company.
 */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId

  const settings = await db.companySettings.findUnique({
    where: { companyId },
    select: { enableInsuranceTax: true },
  })

  // Return defaults if no row exists yet
  return NextResponse.json({
    enableInsuranceTax: settings?.enableInsuranceTax ?? true,
  })
}

/**
 * PUT /api/settings/company
 * Updates company-level settings. Only boss_admin / admin allowed.
 * Triggers recalculation of current month when enableInsuranceTax changes.
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const companyId = (session.user as any).companyId
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

  // Recalculate all DRAFT payrolls for current month so the change takes effect immediately
  const now = new Date()
  await markDraftPayrollsStale(companyId).catch(err =>
    console.warn("markDraftPayrollsStale after enableInsuranceTax toggle:", err)
  )
  recalculateMonth(companyId, now).catch(err =>
    console.warn("recalculateMonth after enableInsuranceTax toggle:", err)
  )

  return NextResponse.json({ ok: true, enableInsuranceTax })
}
