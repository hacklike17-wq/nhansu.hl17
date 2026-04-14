/**
 * Single source of truth for PayrollStatus labels + badge styling + error
 * messages. Consumed by the /luong table badge, PersonalSalaryView, and the
 * chamcong-guard error reporter — previously each had their own drift-prone
 * copy.
 *
 * `PayrollStatus` itself is re-exported from the Prisma client so there's
 * exactly one source — the schema.
 */
import { PayrollStatus } from "@/generated/prisma/enums"

export { PayrollStatus }
export type { PayrollStatus as PayrollStatusValue } from "@/generated/prisma/enums"

export type PayrollStatusMeta = {
  /** Short label used in the /luong status badge. */
  label: string
  /** Longer label used in chamcong-guard error messages. */
  longLabel: string
  /** Tailwind class for the badge background + text color. */
  cls: string
}

export const PAYROLL_STATUS_META: Record<PayrollStatus, PayrollStatusMeta> = {
  DRAFT: {
    label: "Nháp",
    longLabel: "Nháp",
    cls: "bg-gray-100 text-gray-600",
  },
  PENDING: {
    label: "Chờ NV xác nhận",
    longLabel: "Chờ nhân viên xác nhận",
    cls: "bg-amber-100 text-amber-700",
  },
  // APPROVED is retained for legacy rows that haven't migrated to LOCKED yet.
  APPROVED: {
    label: "Đã duyệt",
    longLabel: "Đã duyệt",
    cls: "bg-green-100 text-green-700",
  },
  LOCKED: {
    label: "Đã xác nhận",
    longLabel: "Đã xác nhận",
    cls: "bg-green-100 text-green-700",
  },
  PAID: {
    label: "Đã thanh toán",
    longLabel: "Đã thanh toán",
    cls: "bg-blue-100 text-blue-700",
  },
}
