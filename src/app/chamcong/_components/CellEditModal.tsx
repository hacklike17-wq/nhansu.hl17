'use client'
/**
 * CellEditModal — "edit công số" modal for a single (employee, date) cell
 * on the /chamcong page. Phase 6b extraction.
 *
 * Pure presentation + local form state. The parent still owns:
 *   - which cell is open (`attEdit` state — null / {empId, empName, date})
 *   - the mutation call + save spinner + error message (so the same
 *     `saveError` string is shared with the KPI / overtime modals)
 *
 * The modal owns only its own `val` + `note` form state, seeded by
 * `initialVal` / `initialNote` props on mount. When the user clicks Save,
 * it calls back with `(val, note)` — the parent handles the API request
 * and decides whether to close the modal based on the outcome.
 */
import { useState } from "react"
import { X, AlertTriangle } from "lucide-react"

const QUICK = [0, 0.5, 1.0, 1.5, 2.0] as const

type Props = {
  empName: string
  date: string
  initialVal: number
  initialNote: string
  saving: boolean
  saveError: string | null
  onClose: () => void
  onSave: (val: number, note: string) => void | Promise<void>
}

export default function CellEditModal({
  empName,
  date,
  initialVal,
  initialNote,
  saving,
  saveError,
  onClose,
  onSave,
}: Props) {
  const [val, setVal] = useState<number>(initialVal)
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
            <p className="text-xs text-gray-400">{date} · Công số</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] font-medium text-gray-500 mb-2">Chọn nhanh</p>
        <div className="flex gap-2 mb-4">
          {QUICK.map(v => (
            <button
              key={v}
              onClick={() => setVal(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                val === v
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-blue-400"
              }`}
            >
              {v === 0 ? "0" : v === 0.5 ? "½" : v}
            </button>
          ))}
        </div>
        <p className="text-[11px] font-medium text-gray-500 mb-1.5">Tùy chỉnh</p>
        <input
          type="number"
          step={0.25}
          min={0}
          max={3}
          value={val}
          onChange={e => setVal(parseFloat(e.target.value) || 0)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 mb-4"
        />
        <p className="text-[11px] font-medium text-gray-500 mb-1.5">
          Ghi chú <span className="text-gray-300 font-normal">(tuỳ chọn)</span>
        </p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="VD: nửa ngày sáng, làm bù ngày T2..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 mb-4 resize-none"
          maxLength={200}
        />
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
            onClick={() => onSave(val, note)}
            disabled={saving}
            className="flex-1 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  )
}
