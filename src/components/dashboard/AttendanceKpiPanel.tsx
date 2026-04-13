import { Clock3, CalendarOff, AlertTriangle, Ban, HelpCircle } from "lucide-react"
import type { ReactNode } from "react"
import type { KpiBreakdown } from "@/app/_lib/dashboard-queries"

type Card = {
  code: keyof KpiBreakdown
  label: string
  icon: ReactNode
  cls: string
}

const CARDS: Card[] = [
  { code: "DM", label: "Đi muộn",        icon: <Clock3 size={16}/>,        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { code: "NP", label: "Nghỉ phép",      icon: <CalendarOff size={16}/>,   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { code: "NS", label: "Nghỉ sai",       icon: <AlertTriangle size={16}/>, cls: "bg-red-50 text-red-700 border-red-200" },
  { code: "KL", label: "Không lương",    icon: <Ban size={16}/>,           cls: "bg-rose-50 text-rose-700 border-rose-200" },
  { code: "QC", label: "Quên chấm công", icon: <HelpCircle size={16}/>,    cls: "bg-orange-50 text-orange-700 border-orange-200" },
]

type Props = {
  kpi: KpiBreakdown
  title?: string
  subtitle?: string
}

export default function AttendanceKpiPanel({
  kpi,
  title = "KPI chuyên cần tháng này",
  subtitle = "Số lượt theo từng loại",
}: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-bold text-gray-900">{title}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {CARDS.map(c => (
          <div
            key={c.code}
            className={`border rounded-lg px-3 py-2.5 flex items-center gap-2.5 ${c.cls}`}
          >
            <div className="shrink-0">{c.icon}</div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {c.code} · {c.label}
              </div>
              <div className="text-lg font-bold leading-none mt-0.5 tabular-nums">
                {kpi[c.code]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
