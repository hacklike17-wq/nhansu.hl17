import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { requirePermission, errorResponse } from "@/lib/permission"

/**
 * POST /api/employees/[id]/restore
 *
 * Undo a soft-delete: clears `deletedAt`, restores status + account state,
 * and sets a fresh password (user.password was nulled on DELETE). If the
 * admin doesn't supply `newPassword`, a random 12-char password is generated
 * and returned in the response for out-of-band sharing.
 *
 * Permission: same as delete (`nhanvien.delete` covers terminate+restore).
 * Tenant guard: findFirst scoped by companyId prevents cross-tenant restore.
 * Audit: writes AuditLog entry action=RESTORE with the actor.
 */

function generateRandomPassword(): string {
  return randomBytes(9).toString("base64url").slice(0, 12)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePermission("nhanvien.delete")
    const companyId = ctx.companyId!
    const { id } = await params

    // Must belong to caller's tenant AND must be soft-deleted to restore.
    const emp = await db.employee.findFirst({
      where: { id, companyId },
    })
    if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!emp.deletedAt) {
      return NextResponse.json(
        { error: "NV này chưa bị xoá — không có gì để khôi phục" },
        { status: 400 }
      )
    }

    let body: { newPassword?: string } = {}
    try {
      body = await req.json()
    } catch {
      // empty body is allowed — we'll auto-generate
    }

    const supplied = body.newPassword?.trim()
    if (supplied && supplied.length < 8) {
      return NextResponse.json(
        { error: "Mật khẩu tối thiểu 8 ký tự" },
        { status: 400 }
      )
    }
    const plaintextPassword = supplied && supplied.length >= 8 ? supplied : generateRandomPassword()
    const hashed = await bcrypt.hash(plaintextPassword, 12)

    await db.$transaction(async (tx: any) => {
      await tx.employee.update({
        where: { id },
        data: {
          deletedAt: null,
          status: "WORKING",
          accountStatus: "ACTIVE",
          endDate: null,
        },
      })
      await tx.user.updateMany({
        where: { employeeId: id, companyId },
        data: { password: hashed },
      })
      await tx.auditLog.create({
        data: {
          companyId,
          entityType: "Employee",
          entityId: id,
          action: "RESTORE",
          changedBy: ctx.userId,
          changes: {
            fullName: emp.fullName,
            email: emp.email,
            previouslyDeletedAt: emp.deletedAt,
          },
        },
      })
    })

    // Only return the plaintext when WE generated it; if admin supplied one
    // they already know it — no need to echo.
    const generatedPassword = !supplied ? plaintextPassword : null
    return NextResponse.json({ ok: true, generatedPassword })
  } catch (e) {
    return errorResponse(e)
  }
}
