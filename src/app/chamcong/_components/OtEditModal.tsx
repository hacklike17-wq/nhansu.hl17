'use client'
/**
 * OtEditModal — "edit tăng ca" modal for a single (employee, date) cell on
 * the /chamcong page. Phase 6d extraction — completes the 3-modal split
 * started by CellEditModal (6b) and KpiEditModal (6c).
 *
 * Same parent-owns-save / modal-owns-form shape:
 *   - parent holds `otEdit` (null / {empId, empName, date, initialHours, initialNote})
 *   - modal holds `hours` + `note`, seeded from props on mount
 *   - `onSave(hours, note)` calls back into the parent's upsert flow
 */
import { useState } from "react"
import { X, AlertTriangle } from "lucide-react"

const QUICK_HOURS = [0, 1, 1.5, 2, 2.5, 3] as const

type Props = {
  empName: string
  date: string
  initialHours: number
  initialNote: string
  saving: boolean
  saveError: string | null
  onClose: () => void
  onSave: (hours: number, note: string) => void | Promise<void>
}

export default function OtEditModal({
  empName,
  date,
  initialHours,
  initialNote,
  saving,
  saveError,
  onClose,
  onSave,
}: Props) {
  const [hours, setHours] = useState<number>(initialHours)
  const [note, setNote] = useState<string>(initialNote)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[288px] p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{empName}</p>
            <p className="text-xs text-gray-400">{date} · Tăng ca</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-medium text-gray-500 mb-1.5">
            Số giờ tăng ca
          </label>
          <div className="flex gap-1.5 mb-2">
            {QUICK_HOURS.map(v => (
              <button
                key={v}
                onClick={() => setHours(v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  hours === v
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-gray-700 border-gray-200 hover:border-orange-400"
                }`}
              >
                {v === 0 ? "Xóa" : `${v}h`}
              </button>
            ))}
          </div>
          <input
            type="number"
            step={0.5}
            min={0}
            max={12}
            value={hours}
            onChange={e => setHours(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>

        <div className="mb-4">
          <label className="block text-[11px] font-medium text-gray-500 mb-1.5">
            Ghi chú
          </label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Lý do tăng ca..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>

        {saveError && (
          <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11px]">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{saveError}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Đóng
          </button>
          <button
            onClick={() => onSave(hours, note)}
            disabled={saving}
            className="flex-1 py-2 text-xs font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  )
}
