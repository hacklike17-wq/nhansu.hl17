'use client'
import useSWR from 'swr'

type ApiResponse = {
  currentMonth: string
  monthProgress: {
    workUnitsRecorded: number
    workUnitsExpected: number
    percent: number
    payrollByStatus: Record<string, number>
  }
}

const fetcher = (url: string): Promise<ApiResponse> =>
  fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('fetch failed')
    return r.json()
  })

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:    { label: 'Nháp',           cls: 'bg-gray-100 text-gray-700' },
  PENDING:  { label: 'Chờ NV xác nhận', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt',       cls: 'bg-green-100 text-green-700' },
  LOCKED:   { label: 'Đã xác nhận',    cls: 'bg-green-100 text-green-700' },
  PAID:     { label: 'Đã trả',         cls: 'bg-blue-100 text-blue-700' },
}

export default function ManagerMonthProgress() {
  const { data, isLoading } = useSWR<ApiResponse>(
    '/api/dashboard/manager-overview',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000, dedupingInterval: 2_000 }
  )

  const month = data?.currentMonth ?? ''
  const recorded = data?.monthProgress.workUnitsRecorded ?? 0
  const expected = data?.monthProgress.workUnitsExpected ?? 0
  const percent = data?.monthProgress.percent ?? 0
  const payrollByStatus = data?.monthProgress.payrollByStatus ?? {}

  // Show only statuses that have at least 1 row, but always include LOCKED+PAID for visibility
  const statusList = Object.entries(payrollByStatus).filter(
    ([_status, count]) => count > 0
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 h-full">
      <div className="text-sm font-bold text-gray-900 mb-3">Tiến độ tháng {month}</div>

      {isLoading ? (
        <div className="text-xs text-gray-400 py-4 text-center">Đang tải...</div>
      ) : (
        <>
          {/* Work units progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
              <span>Công đã nhập</span>
              <span className="tabular-nums">
                {recorded} / {expected} ngày
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${percent >= 95 ? 'bg-green-500' : percent >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-1 tabular-nums">{percent}%</div>
          </div>

          {/* Payroll status breakdown */}
          <div>
            <div className="text-[11px] text-gray-500 mb-2">Bảng lương</div>
            {statusList.length === 0 ? (
              <div className="text-[11px] text-gray-400">Chưa có bảng lương nào</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {statusList.map(([status, count]) => {
                  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
                  return (
                    <div
                      key={status}
                      className={`flex items-center justify-between px-2 py-1 rounded text-[11px] font-semibold ${meta.cls}`}
                    >
                      <span>{meta.label}</span>
                      <span className="tabular-nums">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
