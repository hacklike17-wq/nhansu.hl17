'use client'
import useSWR from 'swr'
import { CheckCircle2, AlertTriangle, Ban, Activity } from 'lucide-react'

type ApiResponse = {
  today: string
  currentMonth: string
  isWeekend: boolean
  todayPulse: {
    totalEmployees: number
    workingToday: number
    absentNoReason: number
    onUnpaidLeave: number
    violationsToday: number
  }
}

const fetcher = (url: string): Promise<ApiResponse> =>
  fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('fetch failed')
    return r.json()
  })

type CardProps = {
  label: string
  value: string | number
  hint?: string
  icon: React.ReactNode
  cls: string
}

function Card({ label, value, hint, icon, cls }: CardProps) {
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="shrink-0">{icon}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
          {label}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      {hint && <div className="text-[10px] mt-1.5 opacity-70">{hint}</div>}
    </div>
  )
}

export default function ManagerTodayPulse() {
  const { data, isLoading } = useSWR<ApiResponse>(
    '/api/dashboard/manager-overview',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000, dedupingInterval: 2_000 }
  )

  const isWeekend = data?.isWeekend ?? false
  const total = data?.todayPulse.totalEmployees ?? 0
  const working = data?.todayPulse.workingToday ?? 0
  const absent = data?.todayPulse.absentNoReason ?? 0
  const onUnpaid = data?.todayPulse.onUnpaidLeave ?? 0
  const violations = data?.todayPulse.violationsToday ?? 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        label="Đang làm hôm nay"
        value={isWeekend ? 'Cuối tuần' : `${working}/${total}`}
        hint={isWeekend ? 'Không có ngày làm việc' : isLoading ? 'Đang tải...' : 'Có WorkUnit hôm nay'}
        icon={<CheckCircle2 size={18} className="text-green-600"/>}
        cls="bg-green-50 text-green-900 border-green-200"
      />
      <Card
        label="Vắng không lý do"
        value={isWeekend ? '—' : absent}
        hint={isWeekend ? 'Cuối tuần' : absent > 0 ? 'Cần xử lý' : 'Tốt'}
        icon={<AlertTriangle size={18} className="text-amber-600"/>}
        cls="bg-amber-50 text-amber-900 border-amber-200"
      />
      <Card
        label="Nghỉ không lương"
        value={onUnpaid}
        hint="Đơn đã duyệt cover hôm nay"
        icon={<Ban size={18} className="text-rose-600"/>}
        cls="bg-rose-50 text-rose-900 border-rose-200"
      />
      <Card
        label="Vi phạm KPI hôm nay"
        value={violations}
        hint={violations > 0 ? 'Cần kiểm tra' : 'Không có'}
        icon={<Activity size={18} className="text-red-600"/>}
        cls="bg-red-50 text-red-900 border-red-200"
      />
    </div>
  )
}
