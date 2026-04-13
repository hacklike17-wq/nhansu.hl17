'use client'
import useSWR from 'swr'
import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, RefreshCw } from 'lucide-react'

type Granularity = 'day' | 'month' | 'year'

type ApiResponse = {
  granularity: Granularity
  series: Array<{ key: string; label: string; total: number; count: number }>
  totalSum: number
  totalCount: number
}

const fetcher = (url: string): Promise<ApiResponse> =>
  fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('fetch failed')
    return r.json()
  })

function fmtVnd(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + ' tỷ'
  if (Math.abs(n) >= 1e6) return Math.round(n / 1e6) + ' tr'
  return new Intl.NumberFormat('vi-VN').format(n)
}

function TooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload as ApiResponse['series'][number]
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900">{label}</div>
      <div className="text-gray-500 mt-0.5">
        Tổng: <span className="font-bold text-blue-600 tabular-nums">
          {new Intl.NumberFormat('vi-VN').format(item.total)} ₫
        </span>
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5">{item.count} bảng lương</div>
    </div>
  )
}

const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: 'Ngày',
  month: 'Tháng',
  year: 'Năm',
}

export default function SalaryCashflowChart({ title = 'Dòng tiền lương' }: { title?: string }) {
  const [granularity, setGranularity] = useState<Granularity>('month')

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/dashboard/salary-cashflow?granularity=${granularity}`,
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000, dedupingInterval: 2_000 }
  )

  const series = data?.series ?? []
  const totalSum = data?.totalSum ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <TrendingUp size={16}/>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">{title}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Bảng lương đã duyệt / khoá / trả · {series.length} {GRANULARITY_LABEL[granularity].toLowerCase()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            {(['day', 'month', 'year'] as Granularity[]).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition ${
                  granularity === g
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {GRANULARITY_LABEL[g]}
              </button>
            ))}
          </div>
          <button
            onClick={() => mutate()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 h-[26px]"
            title="Đồng bộ lại"
          >
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-red-500 mb-2">Lỗi tải dữ liệu</div>
      )}

      {series.length === 0 && !isLoading ? (
        <div className="py-12 text-center text-xs text-gray-400">
          Chưa có bảng lương nào được duyệt / trả
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              Tổng {GRANULARITY_LABEL[granularity].toLowerCase()} hiển thị
            </div>
            <div className="text-xl font-bold text-blue-700 tabular-nums">
              {new Intl.NumberFormat('vi-VN').format(totalSum)} ₫
            </div>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  tickFormatter={fmtVnd}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<TooltipContent />} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
