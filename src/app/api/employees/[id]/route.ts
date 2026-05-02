import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { UpdateEmployeeSchema } from "@/lib/schemas/employee"
import bcrypt from "bcryptjs"
import { requirePermission, requireSession, errorResponse } from "@/lib/permission"
import { hasPermission } from "@/constants/data"
import { markDraftPayrollsStale } from "@/lib/services/payroll.service"

// Fields an employee may update on their OWN record without `nhanvien.edit`.
// System fields (email, dob, idCard, taxCode, bhxhCode, salary, department,
// position, contract, status, ...) remain admin-only.
const SELF_EDITABLE_FIELDS = new Set([
  "fullName",
  "phone",
  "gender",
  "address",
  "bankName",
  "bankAccount",
])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    const { id } = await params

    // Employees can only read their own record
    if (ctx.role === "employee" && ctx.employeeId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const employee = await db.employee.findFirst({
      where: { id, companyId: ctx.companyId ?? undefined, deletedAt: null },
      include: { user: { select: { id: true, email: true, role: true } } },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(employee)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    const { id } = await params

    // An employee may always update their own record (whitelisted fields
    // below). Anyone else must hold `nhanvien.edit`.
    const isSelfEdit = ctx.role === "employee" && ctx.employeeId === id
    if (!isSelfEdit && !hasPermission(ctx.permissions, "nhanvien.edit")) {
      return NextResponse.json({ error: "Forbidden: missing nhanvien.edit" }, { status: 403 })
    }

    const companyId = ctx.companyId!

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Request body không hợp lệ" }, { status: 400 })
    }

    if (isSelfEdit) {
      body = Object.fromEntries(
        Object.entries(body).filter(([k]) => SELF_EDITABLE_FIELDS.has(k))
      )
    }

    const parsed = UpdateEmployeeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const { accountPassword, ...empData } = data as any

    const existing = await db.employee.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const emailChanged = data.email && data.email !== existing.email
    const baseSalaryChanged = data.baseSalary !== undefined && Number(data.baseSalary) !== Number(existing.baseSalary)
    const accountStatusChanged = data.accountStatus && data.accountStatus !== existing.accountStatus

    // --- Detect sensitive-field changes for audit log ---
    // These fields impact payroll, tax, social insurance, or banking. Any
    // mutation must be traceable back to the actor + before/after values.
    const SENSITIVE_FIELDS = [
      "baseSalary",
      "responsibilitySalary",
      "excludeFromPayroll",
      "taxCode",
      "bhxhCode",
      "bankAccount",
      "bankName",
      "email",
      "contractType",
      "startDate",
      "endDate",
      "accountStatus",
    ] as const
    const sensitiveDiff: Record<string, { from: unknown; to: unknown }> = {}
    for (const field of SENSITIVE_FIELDS) {
      if ((data as any)[field] === undefined) continue
      const oldVal = (existing as any)[field]
      const newVal = (data as any)[field]
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        sensitiveDiff[field] = { from: oldVal, to: newVal }
      }
    }

    const employee = await db.$transaction(async (tx: any) => {
      const emp = await tx.employee.update({
        where: { id },
        data: {
          ...empData,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          dob: data.dob ? new Date(data.dob) : undefined,
        },
      })

      // Sync User: email change → update linked user too (keeps login in sync)
      if (emailChanged) {
        await tx.user.updateMany({
          where: { employeeId: id, companyId },
          data: { email: data.email!, name: data.fullName ?? emp.fullName },
        })
      } else if (data.fullName) {
        await tx.user.updateMany({
          where: { employeeId: id, companyId },
          data: { name: data.fullName },
        })
      }

      // Password reset
      if (accountPassword?.trim()) {
        const hashed = await bcrypt.hash(accountPassword.trim(), 12)
        await tx.user.updateMany({
          where: { employeeId: id, companyId },
          data: { password: hashed },
        })
      }

      // Audit: only log when a tracked sensitive field actually changed
      // OR password was reset. Plain profile edits (phone/address) skip.
      if (Object.keys(sensitiveDiff).length > 0 || accountPassword?.trim()) {
        await tx.auditLog.create({
          data: {
            companyId,
            entityType: "Employee",
            entityId: id,
            action: "UPDATE_SENSITIVE",
            changedBy: ctx.userId,
            changes: {
              ...sensitiveDiff,
              ...(accountPassword?.trim() ? { passwordReset: true } : {}),
            },
          },
        })
      }

      return emp
    })

    // If base salary changed, flag DRAFT payrolls for recalc (data consistency)
    if (baseSalaryChanged) {
      await markDraftPayrollsStale(companyId).catch(err =>
        console.warn("markDraftPayrollsStale after employee update failed:", err)
      )
    }

    return NextResponse.json(employee)
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
      const e = error as any
      if (e.code === "P2002") {
        return NextResponse.json({ error: "Email này đã tồn tại trong hệ thống" }, { status: 409 })
      }
    }
    return errorResponse(error)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("nhanvien.delete")
    const companyId = ctx.companyId!
    const { id } = await params

    // Verify employee belongs to the company
    const emp = await db.employee.findFirst({ where: { id, companyId } })
    if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Atomic soft-delete: flag employee + lock linked user so login is revoked immediately
    await db.$transaction(async (tx: any) => {
      await tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: "RESIGNED",
          accountStatus: "LOCKED",
          endDate: new Date(),
        },
      })
      // Lock user account: clear password, the authorize() check also blocks via
      // accountStatus === LOCKED + deletedAt guards added in auth.ts
      await tx.user.updateMany({
        where: { employeeId: id, companyId },
        data: { password: null },
      })
      // Audit trail — who terminated, when, snapshot of employee at time of delete
      await tx.auditLog.create({
        data: {
          companyId,
          entityType: "Employee",
          entityId: id,
          action: "SOFT_DELETE",
          changedBy: ctx.userId,
          changes: {
            fullName: emp.fullName,
            email: emp.email,
            code: emp.code,
            department: emp.department,
            position: emp.position,
            previousStatus: emp.status,
            previousAccountStatus: emp.accountStatus,
          },
        },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
