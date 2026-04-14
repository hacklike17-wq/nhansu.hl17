'use client'
/**
 * SnapshotModal — read-only viewer for the immutable payroll calculation
 * snapshot captured at LOCK time (`buildPayrollSnapshot` in payroll.service).
 *
 * Phase 7b extraction from /luong page.tsx. Pure display component: no
 * state, no writes, no side effects. The snapshot object shape is
 * controlled by `buildPayrollSnapshot` — keep this component's reads in
 * sync with that producer if the snapshot schema changes.
 *
 * Sections rendered:
 *   - "Biến đầu vào"   — vars used by the formula engine (key/value list)
 *   - "Kết quả công thức" — per-column formula eval results (null = LỖI)
 *   - "Kết quả cuối"     — grossSalary, BH*, PIT, netSalary
 */
import { X } from "lucide-react"
import { fmtVND } from "@/lib/format"

export type Snapshot = {
  capturedAt?: string
  vars?: Record<string, number>
  formulaResults?: Array<{
    columnKey: string
    columnName: string
    formula: string
    result: number | null
  }>
  computed?: {
    grossSalary?: number
    bhxhEmployee?: number
    bhytEmployee?: number
    bhtnEmployee?: number
    pitTax?: number
    netSalary?: number
  }
}

type Props = {
  snapshot: Snapshot
  onClose: () => void
}

const FINAL_ROWS = [
  { label: "Lương gộp", key: "grossSalary" as const },
  { label: "BHXH NV",   key: "bhxhEmployee" as const, deduct: true },
  { label: "BHYT NV",   key: "bhytEmployee" as const, deduct: true },
  { label: "BHTN NV",   key: "bhtnEmployee" as const, deduct: true },
  { label: "Thuế TNCN", key: "pitTax" as const,       deduct: true },
  { label: "Thực nhận", key: "netSalary" as const,    bold: true },
] as const

export default function SnapshotModal({ snapshot, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[480px] max-h-[90vh] md:max-h-[80vh] overflow-y-auto p-4 md:p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Snapshot tính lương</h3>
            {snapshot.capturedAt && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                Khóa lúc: {new Date(snapshot.capturedAt).toLocaleString("vi-VN")}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Vars */}
        {snapshot.vars && (
          <div className="mb-4">
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">
              Biến đầu vào
            </h4>
            <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
              {Object.entries(snapshot.vars).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[11px]">
                  <span className="text-gray-400 font-mono">{k}</span>
                  <span className="text-gray-700">{v.toLocaleString("vi-VN")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formula results */}
        {snapshot.formulaResults && snapshot.formulaResults.length > 0 && (
          <div className="mb-4">
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">
              Kết quả công thức
            </h4>
            <div className="space-y-0.5">
              {snapshot.formulaResults.map(f => (
                <div
                  key={f.columnKey}
                  className="flex justify-between text-[11px] bg-gray-50 rounded px-2 py-1"
                >
                  <span className="text-gray-600">{f.columnName}</span>
                  <span
                    className={
                      f.result === null ? "text-red-500" : "font-mono text-gray-800"
                    }
                  >
                    {f.result === null ? "LỖI" : fmtVND(f.result)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Computed */}
        {snapshot.computed && (
          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">
              Kết quả cuối
            </h4>
            <div className="bg-blue-50 rounded-lg px-3 py-2 space-y-1">
              {FINAL_ROWS.map(r => {
                const value = snapshot.computed?.[r.key] ?? 0
                const isBold = "bold" in r && r.bold
                const isDeduct = "deduct" in r && r.deduct
                return (
                  <div
                    key={r.key}
                    className={`flex justify-between text-[12px] ${
                      isBold ? "border-t border-blue-200 pt-1 font-semibold" : ""
                    }`}
                  >
                    <span className={isDeduct ? "text-red-500" : "text-gray-600"}>
                      {r.label}
                    </span>
                    <span
                      className={
                        isBold
                          ? "text-blue-700"
                          : isDeduct
                            ? "text-red-600"
                            : "text-gray-800"
                      }
                    >
                      {isDeduct ? "-" : ""}
                      {fmtVND(value)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
