'use client'
/**
 * StatusModal — role-specific payroll status transition picker (Phase 7a
 * extraction from /luong page.tsx).
 *
 * The action set shown to the caller mirrors the role-gated transitions
 * enforced on the server by src/lib/payroll/state-machine.ts:
 *   - DRAFT    → PENDING   ("Gửi nhân viên xác nhận", manager/admin)
 *   - PENDING  → DRAFT     ("Huỷ gửi", manager/admin)
 *   - APPROVED → LOCKED    legacy bridge button
 *   - LOCKED   → PAID      admin-only "Đánh dấu đã trả"
 *   - PAID     terminal
 *
 * Nothing is computed here — this is pure JSX + an `onChange` callback.
 * Keeping the mapping in one place so it stays in sync with the server
 * state machine.
 */
import { X, Clock, Banknote } from "lucide-react"
import { STATUS_MAP } from "@/app/luong/_lib/constants"

export type StatusModalState = {
  id: string
  name: string
  current: string
}

type Props = {
  state: StatusModalState
  onClose: () => void
  onChange: (id: string, status: string) => void | Promise<void>
}

export default function StatusModal({ state, onClose, onChange }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-72 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{state.name}</p>
            <p className="text-xs text-gray-400">
              Hiện tại: {STATUS_MAP[state.current]?.label}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
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
      </div>
    </div>
  )
}
