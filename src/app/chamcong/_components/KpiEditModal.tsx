'use client'
/**
 * KpiEditModal — "edit KPI chuyên cần" picker for a single (employee, date)
 * cell on the /chamcong page. Phase 6c extraction.
 *
 * Same parent-owns-save / modal-owns-form pattern as CellEditModal:
 *   - parent tracks `kpiEdit` = null | {empId, empName, date, initialTypes, initialNote}
 *   - modal owns the currently-selected types + note
 *   - `onSave(types, note)` hands off to the parent for the API call
 *
 * The checkbox list uses KPI_CONFIG from _lib/chamcong-helpers so the
 * per-type label + Tailwind styling stays in one place.
 */
import { useState } from "react"
import { X, AlertTriangle } from "lucide-react"
import type { KpiViolationType } from "@/types"
import { KPI_CONFIG, KPI_TYPES } from "../_lib/chamcong-helpers"

type Props = {
  empName: string
  date: string
  initialTypes: KpiViolationType[]
  initialNote: string
  saveError: string | null
  onClose: () => void
  onSave: (types: KpiViolationType[], note: string) => void | Promise<void>
}

export default function KpiEditModal({
  empName,
  date,
  initialTypes,
  initialNote,
  saveError,
  onClose,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<KpiViolationType[]>(initialTypes)
  const [note, setNote] = useState<string>(initialNote)

  function toggleType(t: KpiViolationType) {
    setSelected(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[320px] p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{empName}</p>
            <p className="text-xs text-gray-400">{date} · KPI Chuyên cần</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] font-medium text-gray-500 mb-2">
          Loại vi phạm (chọn nhiều)
        </p>
        <div className="space-y-2 mb-4">
          {KPI_TYPES.map(t => (
            <label
              key={t}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                selected.includes(t)
                  ? KPI_CONFIG[t].cls + " border-opacity-100"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(t)}
                onChange={() => toggleType(t)}
                className="rounded border-gray-300 text-rose-600 focus:ring-rose-500"
              />
              <div>
                <span className="text-xs font-bold">{t}</span>
                <span className="text-[11px] text-gray-500 ml-2">
                  — {KPI_CONFIG[t].full}
                </span>
              </div>
            </label>
          ))}
        </div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1.5">
          Ghi chú
        </label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Ghi chú vi phạm..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 mb-4"
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
            onClick={() => onSave(selected, note)}
            className="flex-1 py-2 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
