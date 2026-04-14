'use client'
import useSWR from 'swr'
import { Calendar, Wallet, Ban, CheckCircle2 } from 'lucide-react'

type ApiResponse = {
  isWeekend: boolean
  actionQueue: {
    missingAttendanceCount: number
    draftPayrollCount: number
    draftPayrollMonthLabel?: string
    pendingUnpaidLeaves: number
  }
}

const fetcher = (url: string): Promise<ApiResponse> =>
  fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('fetch failed')
    return r.json()
  })

type ActionItem = {
  icon: React.ReactNode
  label: string
  href: string
  cls: string
}

export default function ManagerActionQueue() {
  const { data, isLoading } = useSWR<ApiResponse>(
    '/api/dashboard/manager-overview',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000, dedupingInterval: 2_000 }
  )

  const items: ActionItem[] = []
  const q = data?.actionQueue

  if (q?.missingAttendanceCount && q.missingAttendanceCount > 0) {
    items.push({
      icon: <Calendar size={14} className="text-amber-600" />,
      label: `${q.missingAttendanceCount} ngày công chưa nhập tuần này`,
      href: '/chamcong',
      cls: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
    })
  }
  if (q?.draftPayrollCount && q.draftPayrollCount > 0) {
    const monthLabel = q.draftPayrollMonthLabel ? ` tháng ${q.draftPayrollMonthLabel}` : ''
    items.push({
      icon: <Wallet size={14} className="text-blue-600" />,
      label: `${q.draftPayrollCount} bảng lương${monthLabel} ở DRAFT — cần gửi NV xác nhận`,
      href: '/luong',
      cls: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
    })
  }
  if (q?.pendingUnpaidLeaves && q.pendingUnpaidLeaves > 0) {
    items.push({
      icon: <Ban size={14} className="text-rose-600" />,
      label: `${q.pendingUnpaidLeaves} đơn nghỉ không lương chờ duyệt`,
      href: '/khong-luong',
      cls: 'border-rose-200 bg-rose-50 hover:bg-rose-100',
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 h-full">
      <div className="text-sm font-bold text-gray-900 mb-3">Việc cần làm</div>

      {isLoading && items.length === 0 ? (
        <div className="text-xs text-gray-400 py-6 text-center">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-green-600 py-6 text-center inline-flex items-center justify-center w-full gap-1.5">
          <CheckCircle2 size={14} /> Không có việc cần xử lý ngay
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => (
            <a
              key={idx}
              href={it.href}
              className={`flex items-center justify-between gap-2 px-3 py-2.5 border rounded-lg text-xs transition ${it.cls}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {it.icon}
                <span className="font-medium text-gray-700 truncate">{it.label}</span>
              </div>
              <span className="text-gray-400 shrink-0">→</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
