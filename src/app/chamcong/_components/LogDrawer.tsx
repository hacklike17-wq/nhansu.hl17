'use client'
/**
 * LogDrawer — side-drawer on the /chamcong page that shows, for a single
 * employee + month, a day-by-day log of công / KPI / deduction events and
 * a company-wide audit history tab.
 *
 * Phase 6a extraction: before this file existed, 160+ lines of drawer JSX
 * sat inline at the bottom of page.tsx. The move is purely structural —
 * behaviour (tab switching, audit fetch trigger, summary footer formulas)
 * is unchanged. Drawer-local state (tab, audit list, loading flag) is
 * owned here so the parent only has to track the {empId, empName} tuple.
 */
import { useState } from "react"
import { X } from "lucide-react"
import type { KpiViolationType } from "@/types"
import {
  getDays,
  isWeekend,
  attCls,
  attLabel,
  formatUnits,
  KPI_CONFIG,
  DED_TYPE_MAP,
  DED_STATUS,
} from "../_lib/chamcong-helpers"

type DrawerTab = "data" | "history"

type AuditEntry = {
  id: string
  entityType: string
  action: string
  changedBy: string | null
  changedByName: string | null
  affectedEmployeeId: string | null
  affectedEmployeeName: string | null
  changes: any
  createdAt: string
}

type Props = {
  empId: string
  empName: string
  month: string
  attendance: any[]
  deductions: any[]
  kpiViolations: any[]
  onClose: () => void
}

export default function LogDrawer({
  empId,
  empName,
  month,
  attendance,
  deductions,
  kpiViolations,
  onClose,
}: Props) {
  const [logTab, setLogTab] = useState<DrawerTab>("data")
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  // Fetch audit when switching to history tab.
  // Scope is month-wide (Alt A chosen by user): we do NOT pass employeeId.
  async function fetchAudit() {
    setAuditLoading(true)
    try {
      const url = `/api/chamcong/audit-log?month=${month}`
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json()
      setAuditEntries(data.entries ?? [])
    } catch (e) {
      console.error("fetchAudit error:", e)
      setAuditEntries([])
    } finally {
      setAuditLoading(false)
    }
  }

  const days4log = getDays(month)
  const logUnits = Object.fromEntries(
    attendance
      .filter((a: any) => a.employeeId === empId && a.date.startsWith(month))
      .map((a: any) => [a.date, a.units])
  )
  const logDeds = deductions.filter(
    (d: any) => d.employeeId === empId && d.date.startsWith(month)
  )
  const logKpi = Object.fromEntries(
    kpiViolations
      .filter((k: any) => k.employeeId === empId && k.date.startsWith(month))
      .map((k: any) => [k.date, k])
  )
  const totalUnits = Object.values(logUnits).reduce((s: number, v: any) => s + v, 0)
  const totalViols = Object.values(logKpi).reduce(
    (s: number, k: any) => s + k.types.length,
    0
  )

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/20 hidden md:block" />
      <div
        className="bg-white w-full md:w-88 md:min-w-[340px] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <p className="text-sm font-semibold text-gray-900">{empName}</p>
            <p className="text-[11px] text-gray-400">Log chi tiết · {month}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 px-4 pt-2 border-b border-gray-100">
          <button
            onClick={() => setLogTab("data")}
            className={`px-3 py-2 text-[11px] font-semibold rounded-t-lg transition ${
              logTab === "data"
                ? "bg-white text-blue-700 border border-b-white border-gray-200"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Dữ liệu
          </button>
          <button
            onClick={() => {
              setLogTab("history")
              // Always fetch: the month picker may have changed since
              // the drawer was opened, so cached entries could be stale.
              fetchAudit()
            }}
            className={`px-3 py-2 text-[11px] font-semibold rounded-t-lg transition ${
              logTab === "history"
                ? "bg-white text-blue-700 border border-b-white border-gray-200"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Lịch sử thay đổi
          </button>
        </div>

        {logTab === "data" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {days4log.map(date => {
              const units = logUnits[date] as number | undefined
              const kpi = logKpi[date] as any
              const deds = logDeds.filter((d: any) => d.date === date)
              if (units === undefined && !kpi && deds.length === 0) return null

              const dayLabel = new Date(date + "T00:00:00").toLocaleDateString("vi-VN", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
              })
              return (
                <div key={date} className="py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[11px] font-semibold ${
                        isWeekend(date) ? "text-gray-400" : "text-gray-700"
                      }`}
                    >
                      {dayLabel}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {units !== undefined && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${attCls(units)}`}>
                          {attLabel(units)} công
                        </span>
                      )}
                    </div>
                  </div>
                  {kpi && kpi.types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {kpi.types.map((t: string) => (
                        <span
                          key={t}
                          className={`px-1.5 py-px rounded text-[9px] font-bold border ${
                            KPI_CONFIG[t as KpiViolationType]?.cls ?? ""
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                      {kpi.note && (
                        <span className="text-[10px] text-gray-400 ml-1">{kpi.note}</span>
                      )}
                    </div>
                  )}
                  {deds.map((d: any) => (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between px-2 py-1 rounded-lg border text-[10px] mt-0.5 ${
                        DED_TYPE_MAP[d.type]?.cls ?? "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      <span className="font-medium">
                        {DED_TYPE_MAP[d.type]?.label ?? d.type}
                      </span>
                      <span className={DED_STATUS[d.status]?.cls ?? ""}>
                        {DED_STATUS[d.status]?.label ?? d.status}
                      </span>
                      <span className="font-bold">
                        {d.delta > 0 ? "+" : ""}
                        {d.delta}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
            {days4log.every(
              date =>
                logUnits[date] === undefined &&
                !logKpi[date] &&
                logDeds.filter((d: any) => d.date === date).length === 0
            ) && (
              <p className="text-center text-xs text-gray-400 py-8">
                Chưa có dữ liệu trong tháng này
              </p>
            )}
          </div>
        )}

        {logTab === "history" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            <p className="text-[10px] text-gray-400 italic mb-1">
              Toàn bộ thay đổi công/tăng ca/KPI của công ty trong tháng {month}
            </p>
            {auditLoading ? (
              <p className="text-center text-xs text-gray-400 py-8">Đang tải lịch sử...</p>
            ) : auditEntries.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-8">
                Chưa có thay đổi nào trong tháng
              </p>
            ) : (
              auditEntries.map(e => {
                const c = e.changes ?? {}
                const when = new Date(e.createdAt).toLocaleString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
                let typeBadge = ""
                let typeCls = ""
                if (e.entityType === "WorkUnit") {
                  typeBadge = "Công"
                  typeCls = "bg-green-50 text-green-700 border-green-200"
                } else if (e.entityType === "OvertimeEntry") {
                  typeBadge = "Tăng ca"
                  typeCls = "bg-orange-50 text-orange-700 border-orange-200"
                } else if (e.entityType === "KpiViolation") {
                  typeBadge = "KPI"
                  typeCls = "bg-rose-50 text-rose-700 border-rose-200"
                }

                let summary = ""
                if (e.action === "AUTO_FILL") {
                  summary = `Tự động chấm: +${c.created ?? 0} công · +${c.createdLeaveZeroes ?? 0} nghỉ KL · giữ ${c.skippedExisting ?? 0}`
                } else if (e.action === "BULK_DELETE") {
                  summary = `Xoá tháng (${c.deleted ?? 0} ngày)`
                } else if (e.entityType === "WorkUnit") {
                  const from = c.unitsFrom === null || c.unitsFrom === undefined ? "∅" : String(c.unitsFrom)
                  const to = c.unitsTo === null || c.unitsTo === undefined ? "∅" : String(c.unitsTo)
                  summary = `${c.date ?? ""}: ${from} → ${to} công${c.noteTo ? " · " + c.noteTo : ""}`
                } else if (e.entityType === "OvertimeEntry") {
                  const from = c.hoursFrom === null || c.hoursFrom === undefined ? "∅" : String(c.hoursFrom) + "h"
                  const to = c.hoursTo === null || c.hoursTo === undefined ? "∅" : String(c.hoursTo) + "h"
                  summary = `${c.date ?? ""}: ${from} → ${to}${c.noteTo ? " · " + c.noteTo : ""}`
                } else if (e.entityType === "KpiViolation") {
                  const from = (c.typesFrom ?? []).join(",") || "∅"
                  const to = (c.typesTo ?? []).join(",") || "∅"
                  summary = `${c.date ?? ""}: [${from}] → [${to}]${c.noteTo ? " · " + c.noteTo : ""}`
                }

                return (
                  <div key={e.id} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${typeCls}`}
                      >
                        {typeBadge} · {e.action}
                      </span>
                      <span className="text-[10px] text-gray-400">{when}</span>
                    </div>
                    {e.affectedEmployeeName && (
                      <div className="text-[10px] font-semibold text-gray-800 mb-0.5">
                        👤 {e.affectedEmployeeName}
                      </div>
                    )}
                    <div className="text-[11px] text-gray-700">{summary}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Bởi: <span className="font-semibold">{e.changedByName ?? "Hệ thống"}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        <div className="border-t border-gray-200 px-5 py-3 space-y-1.5">
          {(
            [
              ["Công số nhận", `${formatUnits(totalUnits as number)} công`, "text-green-600"],
              ["Vi phạm KPI", totalViols > 0 ? `${totalViols} lần` : "—", "text-rose-600"],
              [
                "Điều chỉnh công số (duyệt)",
                (() => {
                  const v = logDeds
                    .filter((d: any) => d.status === "APPROVED")
                    .reduce((s: number, d: any) => s + d.delta, 0)
                  return v !== 0 ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}` : "—"
                })(),
                "text-gray-700",
              ],
            ] as [string, string, string][]
          ).map(([label, val, cls]) => (
            <div key={label} className="flex justify-between text-[11px] text-gray-500">
              <span>{label}</span>
              <span className={`font-bold ${cls}`}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
