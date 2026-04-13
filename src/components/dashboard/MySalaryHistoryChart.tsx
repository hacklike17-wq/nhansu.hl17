'use client'
import useSWR from 'swr'
import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { TrendingUp, RefreshCw } from 'lucide-react'

type Series = {
  key: string
  label: string
  net: number
  gross: number
  base: number
  status: string
  kpiCount: number
}

type ApiResponse = {
  series: Series[]
  average: number
  max: { month: string; value: number } | null
  min: { month: string; value: number } | null
  count: number
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
  const item = payload[0]?.payload as Series | undefined
  if (!item) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900">{label}</div>
      <div className="text-gray-500 mt-1">
        Tổng lương:{' '}
        <span className="font-bold text-blue-600 tabular-nums">
          {new Intl.NumberFormat('vi-VN').format(item.net)} ₫
        </span>
      </div>
      <div className="text-gray-500 mt-0.5">
        KPI vi phạm:{' '}
        <span className={`font-bold tabular-nums ${item.kpiCount > 0 ? 'text-rose-600' : 'text-gray-500'}`}>
          {item.kpiCount} ngày
        </span>
      </div>
    </div>
  )
}

export default function MySalaryHistoryChart() {
  const [months, setMonths] = useState<6 | 12>(6)

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/dashboard/my-salary-history?months=${months}`,
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000, dedupingInterval: 2_000 }
  )

  const series = data?.series ?? []
  const average = data?.average ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">
              Lịch sử lương {months} tháng gần nhất
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {series.length > 0
                ? `${series.length} tháng có dữ liệu · biểu đồ đường`
                : 'Chưa có dữ liệu lương'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            {([6, 12] as const).map(p => (
              <button
                key={p}
                onClick={() => setMonths(p)}
                className={`px-3 py-1 text-[11px] font-semibold rounded transition ${
                  months === p
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {p} tháng
              </button>
            ))}
          </div>
          <button
            onClick={() => mutate()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 h-[26px]"
            title="Đồng bộ"
          >
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-red-500 mb-2">Lỗi tải dữ liệu</div>
      )}

      {series.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-400">
          Chưa có bảng lương nào trong {months} tháng gần nhất
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                Trung bình
              </div>
              <div className="text-base font-bold text-gray-900 tabular-nums mt-0.5">
                {new Intl.NumberFormat('vi-VN').format(average)} ₫
              </div>
            </div>
            {data?.max && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                  Cao nhất
                </div>
                <div className="text-base font-bold text-green-600 tabular-nums mt-0.5">
                  {new Intl.NumberFormat('vi-VN').format(data.max.value)} ₫
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{data.max.month}</div>
              </div>
            )}
            {data?.min && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                  Thấp nhất
                </div>
                <div className="text-base font-bold text-amber-600 tabular-nums mt-0.5">
                  {new Intl.NumberFormat('vi-VN').format(data.min.value)} ₫
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{data.min.month}</div>
              </div>
            )}
          </div>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  tickFormatter={fmtVnd}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                  width={55}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip content={<TooltipContent />} cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="line"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="net"
                  name="Tổng lương nhận (₫)"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#2563eb' }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="kpiCount"
                  name="KPI chuyên cần (số ngày vp)"
                  stroke="#e11d48"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3, fill: '#e11d48' }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
