import { db } from "@/lib/db"
import { AuthError } from "@/lib/permission"

/**
 * Shared guard: reject chamcong mutations when the underlying Payroll is
 * no longer in DRAFT state.
 *
 * Rationale: once a payroll leaves DRAFT (PENDING / APPROVED / LOCKED / PAID),
 * its numbers are either pending employee confirmation, already confirmed,
 * or already paid out. Silently mutating the source data (WorkUnit,
 * OvertimeEntry, KpiViolation) would desynchronize the chamcong display
 * from the locked payroll, confusing both manager and employee.
 *
 * The autoRecalcDraftPayroll helper already refuses to recalculate non-DRAFT
 * payrolls, so previously the mutation "succeeded" but had no effect on
 * salary — a classic footgun. This guard makes the rejection explicit.
 *
 * Status labels for the user-facing error (DRAFT → PENDING → LOCKED → PAID).
 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT:    "Nháp",
  PENDING:  "Chờ nhân viên xác nhận",
  APPROVED: "Đã duyệt",
  LOCKED:   "Đã xác nhận",
  PAID:     "Đã thanh toán",
}

/**
 * Throws AuthError(409) if the employee's payroll for the month containing
 * `date` exists and is NOT DRAFT. Returns silently otherwise (meaning:
 * either no payroll exists yet, or it's still in DRAFT → mutation allowed).
 *
 * Payroll.month is stored as @db.Date (midnight UTC), always the 1st of the
 * month. We match by constructing that exact key.
 */
export async function requireDraftPayroll(
  employeeId: string,
  date: Date
): Promise<void> {
  const monthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  )
  const payroll = await db.payroll.findUnique({
    where: { employeeId_month: { employeeId, month: monthStart } },
    select: { status: true },
  })
  if (payroll && payroll.status !== "DRAFT") {
    const label = STATUS_LABEL[payroll.status] ?? payroll.status
    throw new AuthError(
      `Không thể sửa — bảng lương tháng này đang ở trạng thái "${label}"`,
      409
    )
  }
}

/**
 * Batch version: returns a Set of employeeIds whose payroll for `monthStart`
 * is NOT DRAFT (= should be skipped). Used by auto-fill so non-DRAFT employees
 * are left alone while DRAFT employees still get their workdays filled.
 */
export async function lockedEmployeeIdsForMonth(
  companyId: string,
  monthStart: Date,
  employeeIds: string[]
): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set()
  const payrolls = await db.payroll.findMany({
    where: {
      companyId,
      month: monthStart,
      employeeId: { in: employeeIds },
      status: { not: "DRAFT" },
    },
    select: { employeeId: true },
  })
  return new Set(payrolls.map(p => p.employeeId))
}
