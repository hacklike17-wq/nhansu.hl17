import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { UpdatePayrollStatusSchema } from "@/lib/schemas/payroll"
import { buildPayrollSnapshot } from "@/lib/services/payroll.service"
import { requireRole, requireSession, errorResponse } from "@/lib/permission"
import { canTransition, type PayrollRole } from "@/lib/payroll/state-machine"
import type { PayrollStatus } from "@/constants/payroll-status"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("admin")
    const { id } = await params

    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const payroll = await db.payroll.findFirst({ where: { id, companyId: ctx.companyId } })
    if (!payroll) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })
    if (payroll.status !== "DRAFT")
      return NextResponse.json({ error: "Chỉ xóa được bản lương DRAFT" }, { status: 400 })

    await db.payroll.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}

// Transition + role gates live in src/lib/payroll/state-machine.ts —
// see canTransition() below. Runtime guards (Phase 09 anomaly check, Phase
// 07 needsRecalc flag) stay in this handler because they depend on data
// attached to the row, not the state graph itself.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    const { id } = await params
    const body = await req.json()

    const parsed = UpdatePayrollStatusSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { status, note } = parsed.data

    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const payroll = await db.payroll.findFirst({ where: { id, companyId: ctx.companyId } })
    if (!payroll) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })

    // Cross-tenant / cross-employee guard (employee can only touch own row).
    if (ctx.role === "employee" && payroll.employeeId !== ctx.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (ctx.role !== "employee" && ctx.role !== "manager" && ctx.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Role-gated transitions (admin-sends, employee-confirms flow) — extracted
    // into src/lib/payroll/state-machine.ts (Phase 4 refactor).
    const check = canTransition(
      payroll.status as PayrollStatus,
      status as PayrollStatus,
      ctx.role as PayrollRole
    )
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: check.status })
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
        ctx.userId,
        payroll
      )
    }

    const now = new Date()
    const updated = await db.$transaction(async (tx: any) => {
      const updateResult = await tx.payroll.updateMany({
        where: { id, companyId: payroll.companyId, status: payroll.status },
        data: {
          status,
          note,
          ...(status === "APPROVED" ? { approvedBy: ctx.userId, approvedAt: now } : {}),
          ...(status === "LOCKED"   ? { approvedBy: ctx.userId, approvedAt: now, needsRecalc: false, snapshot: calcSnapshot } : {}),
          ...(status === "PAID"     ? { paidAt: now } : {}),
        },
      })

      if (updateResult.count === 0) {
        throw new Error("Bảng lương đã được xử lý bởi người khác")
      }

      const { id: _id, ...payrollOldData } = payroll as any
      await tx.auditLog.create({
        data: {
          companyId: payroll.companyId,
          entityType: "Payroll",
          entityId: id,
          action: status,
          changedBy: ctx.userId,
          changes: { previousStatus: payroll.status, newStatus: status, note: note ?? null },
          oldData: payrollOldData,
          newData: { status, changedAt: now.toISOString(), changedBy: ctx.userId },
        },
      })

      return tx.payroll.findUnique({ where: { id } })
    })

    return NextResponse.json(updated)
  } catch (e) {
    return errorResponse(e)
  }
}
