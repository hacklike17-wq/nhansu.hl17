import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { UpdatePayrollStatusSchema } from "@/lib/schemas/payroll"
import { buildPayrollSnapshot } from "@/lib/services/payroll.service"
import { requireRole, requireSession, errorResponse } from "@/lib/permission"

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

// Flow: admin sends payroll → employee confirms/rejects
//  - DRAFT → PENDING:  admin/manager sends payroll to employee for confirmation
//  - PENDING → LOCKED: employee confirms amount is correct (locks immutably)
//  - PENDING → DRAFT:  employee rejects (with note) OR admin cancels the send
//  - LOCKED → PAID:    admin marks paid
// Legacy APPROVED state is kept as a transition target for backwards compat
// with any rows that were already in that state, but is no longer reachable
// through the new flow.
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:    ["PENDING"],
  PENDING:  ["LOCKED", "DRAFT"],
  APPROVED: ["LOCKED"], // legacy bridge — existing APPROVED rows can still be locked
  LOCKED:   ["PAID"],
  PAID:     [],
}

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

    // Role-gated transitions (admin-sends, employee-confirms flow):
    //  - Employee: own payroll only — confirm (PENDING → LOCKED) or reject (PENDING → DRAFT)
    //  - Manager: DRAFT → PENDING (send), PENDING → DRAFT (cancel send)
    //  - Admin: all of the above + LOCKED → PAID
    if (ctx.role === "employee") {
      if (payroll.employeeId !== ctx.employeeId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const employeeAllowed: Array<[string, string]> = [
        ["PENDING", "LOCKED"], // xác nhận đúng
        ["PENDING", "DRAFT"],  // từ chối với ghi chú
      ]
      if (!employeeAllowed.some(([f, t]) => f === payroll.status && t === status)) {
        return NextResponse.json(
          { error: "Nhân viên chỉ được xác nhận hoặc từ chối bảng lương đang chờ xác nhận" },
          { status: 403 }
        )
      }
    } else if (ctx.role === "manager") {
      const managerAllowed: Array<[string, string]> = [
        ["DRAFT", "PENDING"],   // gửi nhân viên xác nhận
        ["PENDING", "DRAFT"],   // huỷ gửi
      ]
      if (!managerAllowed.some(([f, t]) => f === payroll.status && t === status)) {
        return NextResponse.json({ error: "Chỉ Admin mới được đánh dấu đã trả" }, { status: 403 })
      }
    } else if (ctx.role === "admin") {
      // All transitions allowed by VALID_TRANSITIONS below
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

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
