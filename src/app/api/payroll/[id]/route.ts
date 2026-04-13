import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { UpdatePayrollStatusSchema } from "@/lib/schemas/payroll"
import { buildPayrollSnapshot } from "@/lib/services/payroll.service"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  if (!["boss_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const companyId = (session.user as any).companyId

  const payroll = await db.payroll.findFirst({ where: { id, companyId } })
  if (!payroll) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })
  if (payroll.status !== "DRAFT")
    return NextResponse.json({ error: "Chỉ xóa được bản lương DRAFT" }, { status: 400 })

  await db.payroll.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// Phase 07: LOCKED added between APPROVED and PAID
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:    ["PENDING"],
  PENDING:  ["APPROVED", "DRAFT"],
  APPROVED: ["LOCKED"],
  LOCKED:   ["PAID"],
  PAID:     [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const parsed = UpdatePayrollStatusSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { status, note } = parsed.data

  const payroll = await db.payroll.findUnique({ where: { id } })
  if (!payroll) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })

  const allowed = VALID_TRANSITIONS[payroll.status] ?? []
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Không thể chuyển từ ${payroll.status} sang ${status}` },
      { status: 400 }
    )
  }

  // Phase 09: DRAFT → PENDING blocked if error-level anomalies exist
  if (status === "PENDING") {
    const anomalyList: any[] = (payroll as any).anomalies ?? []
    const errors = anomalyList.filter((a: any) => a.severity === "error")
    if (errors.length > 0) {
      return NextResponse.json(
        { error: `Không thể gửi duyệt: ${errors.map((e: any) => e.message).join("; ")}` },
        { status: 400 }
      )
    }
  }

  // Phase 07: LOCKED requires needsRecalc === false
  if (status === "LOCKED" && (payroll as any).needsRecalc) {
    return NextResponse.json(
      { error: "Bảng lương cần được cập nhật trước khi khóa. Nhấn \"Cập nhật lương\" trước." },
      { status: 400 }
    )
  }

  // Phase 07b: Build snapshot OUTSIDE transaction (async I/O shouldn't block tx)
  let calcSnapshot: any = undefined
  if (status === "LOCKED") {
    calcSnapshot = await buildPayrollSnapshot(
      payroll.companyId,
      payroll.employeeId,
      payroll.month,
      session.user.id!,
      payroll
    )
  }

  const now = new Date()
  const updated = await db.$transaction(async (tx: any) => {
    // Phase 07: concurrency guard — only proceed if status still matches expected previous state
    const updateResult = await tx.payroll.updateMany({
      where: { id, companyId: payroll.companyId, status: payroll.status },
      data: {
        status,
        note,
        ...(status === "APPROVED" ? { approvedBy: session.user.id, approvedAt: now } : {}),
        ...(status === "LOCKED"   ? { approvedBy: session.user.id, approvedAt: now, needsRecalc: false, snapshot: calcSnapshot } : {}),
        ...(status === "PAID"     ? { paidAt: now } : {}),
      },
    })

    if (updateResult.count === 0) {
      throw new Error("Bảng lương đã được xử lý bởi người khác")
    }

    // Phase 07: write AuditLog with oldData + newData snapshots
    const { id: _id, ...payrollOldData } = payroll as any
    await tx.auditLog.create({
      data: {
        companyId: payroll.companyId,
        entityType: "Payroll",
        entityId: id,
        action: status,
        changedBy: session.user.id,
        changes: { previousStatus: payroll.status, newStatus: status },
        oldData: payrollOldData,
        newData: { status, changedAt: now.toISOString(), changedBy: session.user.id },
      },
    })

    return tx.payroll.findUnique({ where: { id } })
  })

  return NextResponse.json(updated)
}
