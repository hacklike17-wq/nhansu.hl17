'use client'
import useSWR from 'swr'
import { useState } from 'react'
import {
  Clock3,
  CalendarOff,
  AlertTriangle,
  Ban,
  HelpCircle,
  Laptop,
  LogOut,
  RefreshCw,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { KpiBreakdown } from '@/app/_lib/dashboard-queries'

type Card = {
  code: keyof KpiBreakdown
  label: string
  icon: ReactNode
  cls: string
}

const CARDS: Card[] = [
  { code: 'ĐM',  label: 'Đi muộn',          icon: <Clock3 size={16}/>,        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { code: 'VS',  label: 'Về sớm',            icon: <LogOut size={16}/>,        cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { code: 'NP',  label: 'Nghỉ (lần 1)',     icon: <CalendarOff size={16}/>,   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { code: 'KL',  label: 'Nghỉ không lương', icon: <Ban size={16}/>,           cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  { code: 'KL2', label: 'Nghỉ KL ½ ngày',   icon: <Ban size={16}/>,           cls: 'bg-pink-50 text-pink-700 border-pink-200' },
  { code: 'LT',  label: 'Nghỉ Lễ tết',      icon: <AlertTriangle size={16}/>, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { code: 'QCC', label: 'Quên chấm công',   icon: <HelpCircle size={16}/>,    cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  { code: 'OL',  label: 'Làm Online',        icon: <Laptop size={16}/>,        cls: 'bg-teal-50 text-teal-700 border-teal-200' },
]

type ApiResponse = {
  month: string
  scope: 'self' | 'company'
  totalRows: number
  tally: KpiBreakdown
}

const fetcher = (url: string): Promise<ApiResponse> =>
  fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('fetch failed')
    return r.json()
  })

function currentMonthYYYYMM(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

type Props = {
  /** Fallback values used on first paint before SWR settles. */
  initialKpi?: KpiBreakdown
  title?: string
  subtitle?: string
}

export default function AttendanceKpiPanel({
  initialKpi,
  title = 'KPI chuyên cần',
  subtitle,
}: Props) {
  const [month, setMonth] = useState<string>(currentMonthYYYYMM())

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/dashboard/attendance-kpi?month=${month}`,
    fetcher,
    {
      // Critical for "đồng bộ với dữ liệu gốc": always re-fetch on window focus,
      // e.g. after the user navigates back from /chamcong.
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 60_000,
      dedupingInterval: 2_000,
    }
  )

  const tally: KpiBreakdown = data?.tally ?? initialKpi ?? { "ĐM": 0, NP: 0, KL: 0, KL2: 0, LT: 0, QCC: 0, OL: 0, VS: 0 }
  const totalRows = data?.totalRows ?? 0
  const scopeLabel =
    data?.scope === 'self'
      ? 'Dữ liệu cá nhân'
      : data?.scope === 'company'
        ? 'Toàn công ty'
        : ''

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-sm font-bold text-gray-900">{title}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {subtitle ?? (scopeLabel ? `${scopeLabel} · ${totalRows} ngày có vi phạm` : 'Đang đồng bộ...')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs h-7 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={() => mutate()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 h-7"
            title="Đồng bộ lại từ dữ liệu gốc"
          >
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
            Đồng bộ
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-red-500 mb-2">Lỗi tải dữ liệu KPI</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
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
                {tally[c.code]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
