'use client'
/**
 * StatusModal — role-specific payroll status transition picker (Phase 7a
 * extraction from /luong page.tsx).
 *
 * The action set shown to the caller mirrors the role-gated transitions
 * enforced on the server by src/lib/payroll/state-machine.ts:
 *   - DRAFT    → PENDING   ("Gửi nhân viên xác nhận", manager/admin)
 *   - PENDING  → DRAFT     ("Huỷ gửi", manager/admin)
 *   - PENDING  → LOCKED    ("Xác nhận thay NV", ADMIN-ONLY force-confirm)
 *   - APPROVED → LOCKED    legacy bridge button
 *   - LOCKED   → PAID      admin-only "Đánh dấu đã trả"
 *   - PAID     terminal
 *
 * Force-confirm (admin PENDING → LOCKED) uses a two-step flow inside this
 * modal: the user enters a reason (≥10 chars) and ticks a confirmation
 * checkbox before the "Xác nhận & khoá" button activates. The reason is
 * sent as the PATCH `note` field and recorded in AuditLog.
 */
import { useState } from "react"
import { X, Clock, Banknote, Lock, AlertTriangle } from "lucide-react"
import { STATUS_MAP } from "@/app/luong/_lib/constants"

export type StatusModalState = {
  id: string
  name: string
  current: string
}

type Props = {
  state: StatusModalState
  isAdmin?: boolean
  onClose: () => void
  onChange: (id: string, status: string, note?: string) => void | Promise<void>
}

const MIN_REASON_LEN = 10

export default function StatusModal({ state, isAdmin, onClose, onChange }: Props) {
  const [view, setView] = useState<"actions" | "force-lock">("actions")
  const [reason, setReason] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reasonOk = reason.trim().length >= MIN_REASON_LEN
  const canConfirmLock = reasonOk && acknowledged && !submitting

  async function submitForceLock() {
    if (!canConfirmLock) return
    setSubmitting(true)
    try {
      await onChange(state.id, "LOCKED", `[Xác nhận thay NV] ${reason.trim()}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl p-5 ${view === "force-lock" ? "w-96" : "w-72"}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{state.name}</p>
            <p className="text-xs text-gray-400">
              {view === "force-lock"
                ? "Xác nhận thay nhân viên"
                : `Hiện tại: ${STATUS_MAP[state.current]?.label}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {view === "actions" && (
          <div className="space-y-2">
            {state.current === "DRAFT" && (
              <button
                onClick={() => onChange(state.id, "PENDING")}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-xl hover:bg-amber-100"
              >
                <Clock size={13} /> Gửi nhân viên xác nhận
              </button>
            )}
            {state.current === "PENDING" && (
              <>
                <p className="text-[11px] text-gray-500 px-1 mb-1">
                  Đang chờ nhân viên xác nhận. Chỉ nhân viên được xác nhận hoặc từ chối.
                </p>
                <button
                  onClick={() => onChange(state.id, "DRAFT")}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-100"
                >
                  Huỷ gửi — hoàn về nháp
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setView("force-lock")}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold rounded-xl hover:bg-orange-100"
                  >
                    <Lock size={13} /> Xác nhận thay NV (khoá ngay)
                  </button>
                )}
              </>
            )}
            {state.current === "APPROVED" && (
              <button
                onClick={() => onChange(state.id, "LOCKED")}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold rounded-xl hover:bg-orange-100"
              >
                🔒 Khoá bảng lương (legacy)
              </button>
            )}
            {state.current === "LOCKED" && (
              <button
                onClick={() => onChange(state.id, "PAID")}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded-xl hover:bg-blue-100"
              >
                <Banknote size={13} /> Đánh dấu đã trả
              </button>
            )}
            {state.current === "PAID" && (
              <p className="text-[11px] text-gray-500 px-1 py-2 text-center">
                Đã thanh toán — không còn bước nào.
              </p>
            )}
          </div>
        )}

        {view === "force-lock" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700 leading-relaxed">
                Sau khi xác nhận, bảng lương sẽ <b>bị khoá ngay</b> và không thể sửa/xoá.
                Công, KPI, OT, deductions của tháng này cũng bị khoá. Chỉ có thể chuyển tiếp sang <i>Đã thanh toán</i>.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Lý do xác nhận thay <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="VD: NV đã OK qua Zalo ngày 20/4, không thể tự bấm xác nhận..."
                rows={3}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 resize-none"
              />
              <p className={`text-[10px] mt-1 ${reasonOk ? "text-gray-400" : "text-gray-500"}`}>
                {reason.trim().length}/{MIN_REASON_LEN} ký tự tối thiểu — lý do sẽ lưu vào lịch sử duyệt.
              </p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
                className="mt-0.5 accent-orange-600"
              />
              <span className="text-[11px] text-gray-700 leading-relaxed">
                Tôi xác nhận nhân viên đã đồng ý với bảng lương này và chịu trách nhiệm về thao tác xác nhận thay.
              </span>
            </label>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setView("actions")}
                disabled={submitting}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-100 disabled:opacity-50"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={submitForceLock}
                disabled={!canConfirmLock}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-600 text-white text-xs font-semibold rounded-xl hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Lock size={12} /> {submitting ? "Đang khoá..." : "Xác nhận & khoá"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
