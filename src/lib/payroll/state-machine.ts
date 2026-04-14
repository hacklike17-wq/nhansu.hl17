/**
 * Payroll status state machine (Phase 4 refactor).
 *
 * Centralizes the transition rules previously inlined inside
 * `src/app/api/payroll/[id]/route.ts`. The transitions are purposely split
 * into two layers:
 *
 *   1. `PAYROLL_TRANSITIONS` — what transitions are *structurally* valid at
 *      all (e.g. DRAFT can only go to PENDING, PAID is terminal).
 *   2. `ROLE_ALLOWED_TRANSITIONS` — which transitions each role is allowed
 *      to make. Employee can only confirm/reject a PENDING row; manager can
 *      only send/cancel sends; admin gets the full set (including LOCKED →
 *      PAID).
 *
 * The semantics are *identical* to the old inline code — this module is a
 * 1:1 extraction, not a logic rewrite. The phase-09 anomaly check and the
 * needsRecalc guard intentionally live in the route handler; they are
 * runtime-data concerns (anomaly list on the row, recalc flag) rather than
 * pure state-graph rules.
 */
import type { PayrollStatus } from "@/constants/payroll-status"

export type PayrollRole = "employee" | "manager" | "admin"

/**
 * Structural transition graph. A transition is valid only if `target` is in
 * `PAYROLL_TRANSITIONS[currentStatus]`. APPROVED is kept as a bridge for
 * legacy rows that were already approved under the old flow; new rows never
 * reach APPROVED anymore.
 */
export const PAYROLL_TRANSITIONS: Record<PayrollStatus, PayrollStatus[]> = {
  DRAFT:    ["PENDING"],
  PENDING:  ["LOCKED", "DRAFT"],
  APPROVED: ["LOCKED"], // legacy bridge
  LOCKED:   ["PAID"],
  PAID:     [],
}

/**
 * Per-role allowlist. If a (from, to) pair is not listed here for the
 * caller's role, the transition is rejected. Admin is intentionally absent
 * — admin inherits the full `PAYROLL_TRANSITIONS` graph.
 */
const ROLE_ALLOWED_TRANSITIONS: Record<Exclude<PayrollRole, "admin">, Array<[PayrollStatus, PayrollStatus]>> = {
  employee: [
    ["PENDING", "LOCKED"], // xác nhận đúng
    ["PENDING", "DRAFT"],  // từ chối với ghi chú
  ],
  manager: [
    ["DRAFT", "PENDING"],  // gửi nhân viên xác nhận
    ["PENDING", "DRAFT"],  // huỷ gửi
  ],
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; reason: string; status: number }

/**
 * Returns whether the caller is allowed to move a payroll from `from` to
 * `to`. Rejection reasons mirror the messages the old inline check returned
 * to the client (same wording + HTTP status) so nothing in the UI layer has
 * to change.
 */
export function canTransition(
  from: PayrollStatus,
  to: PayrollStatus,
  role: PayrollRole
): TransitionCheck {
  // Role gate (admin gets to skip this step).
  if (role !== "admin") {
    const allowed = ROLE_ALLOWED_TRANSITIONS[role]
    const matches = allowed.some(([f, t]) => f === from && t === to)
    if (!matches) {
      if (role === "employee") {
        return {
          ok: false,
          reason:
            "Nhân viên chỉ được xác nhận hoặc từ chối bảng lương đang chờ xác nhận",
          status: 403,
        }
      }
      return {
        ok: false,
        reason: "Chỉ Admin mới được đánh dấu đã trả",
        status: 403,
      }
    }
  }

  // Structural gate (applies to every role, including admin).
  const allowed = PAYROLL_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Không thể chuyển từ ${from} sang ${to}`,
      status: 400,
    }
  }

  return { ok: true }
}
