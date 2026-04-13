'use client'
import useSWR from 'swr'
import { CalendarCheck, Clock3, Wallet, Ban } from 'lucide-react'

type ApiResponse = {
  month: string | null
  daysWorked: number
  daysExpectedSoFar: number
  overtimeHours: number
  overtimePay: number
  unpaidLeaveDays: number
}

const fetcher = (url: string): Promise<ApiResponse> =>
  fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('fetch failed')
    return r.json()
  })

function fmtVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫'
}

export default function MyAttendanceMiniStats() {
  const { data } = useSWR<ApiResponse>(
    '/api/dashboard/my-attendance-summary',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000, dedupingInterval: 2_000 }
  )

  const daysWorked = data?.daysWorked ?? 0
  const daysExpected = data?.daysExpectedSoFar ?? 0
  const otHours = data?.overtimeHours ?? 0
  const otPay = data?.overtimePay ?? 0
  const unpaidDays = data?.unpaidLeaveDays ?? 0

  const progress =
    daysExpected > 0 ? Math.min(100, Math.round((daysWorked / daysExpected) * 100)) : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Card 1 — Công đi làm */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
            <CalendarCheck size={15}/>
          </div>
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Công đi làm
          </div>
        </div>
        <div className="text-xl font-bold text-gray-900 tabular-nums">
          {daysWorked.toFixed(1)}
          <span className="text-xs text-gray-400 font-normal"> / {daysExpected} ngày</span>
        </div>
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card 2 — Giờ tăng ca */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
            <Clock3 size={15}/>
          </div>
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Giờ tăng ca
          </div>
        </div>
        <div className="text-xl font-bold text-gray-900 tabular-nums">
          {otHours}
          <span className="text-xs text-gray-400 font-normal"> giờ</span>
        </div>
        <div className="mt-2 text-[10px] text-gray-400">Trong tháng</div>
      </div>

      {/* Card 3 — Tiền tăng ca */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Wallet size={15}/>
          </div>
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Tiền tăng ca
          </div>
        </div>
        <div className="text-xl font-bold text-blue-700 tabular-nums">{fmtVnd(otPay)}</div>
        <div className="mt-2 text-[10px] text-gray-400">Đã tính vào lương</div>
      </div>

      {/* Card 4 — Nghỉ không lương */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <Ban size={15}/>
          </div>
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Nghỉ không lương
          </div>
        </div>
        <div className="text-xl font-bold text-gray-900 tabular-nums">
          {unpaidDays}
          <span className="text-xs text-gray-400 font-normal"> ngày</span>
        </div>
        <div className="mt-2 text-[10px] text-gray-400">Đã được duyệt</div>
      </div>
    </div>
  )
}
