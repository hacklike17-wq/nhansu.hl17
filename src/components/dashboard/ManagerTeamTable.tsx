'use client'
import useSWR from 'swr'
import { CheckCircle2, Ban, AlertTriangle, HelpCircle, Sun, ArrowRight, AlertCircle } from 'lucide-react'

type TodayStatus = 'WORKING' | 'UNPAID_LEAVE' | 'ABSENT' | 'UNKNOWN' | 'WEEKEND'

type TeamRow = {
  employeeId: string
  code: string | null
  fullName: string
  position: string
  department: string
  todayStatus: TodayStatus
  monthWorkUnits: number
  monthWorkdaysExpected: number
  kpiViolationCount: number
  payrollStatus: string | null
}

type ApiResponse = {
  month: string
  isWeekend: boolean
  workdaysInMonth: number
  team: TeamRow[]
}

const fetcher = (url: string): Promise<ApiResponse> =>
  fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('fetch failed')
    return r.json()
  })

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-amber-600',
  'bg-pink-600', 'bg-cyan-600', 'bg-red-500', 'bg-indigo-600',
]
function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name || '').slice(0, 2).toUpperCase()
}
function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const STATUS_META: Record<TodayStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  WORKING:      { label: 'Đang làm', cls: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 size={11} /> },
  UNPAID_LEAVE: { label: 'Nghỉ KL',  cls: 'bg-rose-100 text-rose-700 border-rose-200',    icon: <Ban size={11} /> },
  ABSENT:       { label: 'Vắng',     cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: <AlertTriangle size={11} /> },
  UNKNOWN:      { label: 'Chưa có',  cls: 'bg-gray-100 text-gray-500 border-gray-200',    icon: <HelpCircle size={11} /> },
  WEEKEND:      { label: 'Cuối tuần',cls: 'bg-gray-100 text-gray-500 border-gray-200',    icon: <Sun size={11} /> },
}

const PAYROLL_META: Record<string, { label: string; cls: string }> = {
  DRAFT:    { label: 'Nháp',           cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  PENDING:  { label: 'Chờ NV',         cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Đã duyệt',       cls: 'bg-green-100 text-green-700 border-green-200' },
  LOCKED:   { label: 'Đã xác nhận',    cls: 'bg-green-100 text-green-700 border-green-200' },
  PAID:     { label: 'Đã trả',         cls: 'bg-blue-100 text-blue-700 border-blue-200' },
}

export default function ManagerTeamTable() {
  const { data, isLoading, error } = useSWR<ApiResponse>(
    '/api/dashboard/manager-team',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000, dedupingInterval: 2_000 }
  )

  const team = data?.team ?? []

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-sm font-bold text-gray-900">
          Tổng quan nhân viên · tháng {data?.month ?? ''}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          {team.length > 0
            ? `${team.length} nhân viên · click 1 dòng để vào chấm công`
            : isLoading
              ? 'Đang tải...'
              : 'Chưa có nhân viên'}
        </div>
      </div>

      {error && (
        <div className="px-4 py-6 text-xs text-red-500 text-center">Lỗi tải dữ liệu</div>
      )}

      {team.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Nhân viên</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-500 w-[110px]">Hôm nay</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500 w-[140px]">Công tháng</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-500 w-[80px]">KPI vp</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-500 w-[150px]">Bảng lương</th>
                <th className="px-3 py-2.5 w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {team.map(row => {
                const status = STATUS_META[row.todayStatus]
                const payroll = row.payrollStatus
                  ? PAYROLL_META[row.payrollStatus] ?? { label: row.payrollStatus, cls: 'bg-gray-100 text-gray-700 border-gray-200' }
                  : { label: 'Chưa tạo', cls: 'bg-gray-50 text-gray-400 border-gray-200' }
                const seed = row.code ?? row.employeeId
                const expected = row.monthWorkdaysExpected || 1
                const pct = Math.min(100, Math.round((row.monthWorkUnits / expected) * 100))
                const kpiAlert = row.kpiViolationCount >= 3

                return (
                  <tr key={row.employeeId} className="border-b border-gray-50 hover:bg-blue-50/20 transition">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${avatarColor(seed)}`}>
                          {initials(row.fullName)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{row.fullName}</div>
                          <div className="text-[10px] text-gray-400 truncate">
                            {row.code ? `${row.code} · ` : ''}{row.position}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${status.cls}`}>
                        {status.icon} {status.label}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="text-[11px] tabular-nums text-gray-700 mb-1">
                        {row.monthWorkUnits} / {row.monthWorkdaysExpected}
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${pct >= 95 ? 'bg-green-500' : pct >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${kpiAlert ? 'text-red-600' : 'text-gray-700'}`}>
                        {row.kpiViolationCount}
                        {kpiAlert && <AlertCircle size={11} />}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${payroll.cls}`}>
                        {payroll.label}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <a
                        href="/chamcong"
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        title="Vào chấm công"
                      >
                        <ArrowRight size={13} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
