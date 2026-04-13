'use client'
import useSWR from 'swr'
import { CheckCircle2, Clock, Lock, Banknote, FileText, RotateCcw } from 'lucide-react'

type HistoryEntry = {
  id: string
  action: string
  changedBy: string | null
  changedByName: string | null
  changes: any
  createdAt: string
}

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  DRAFT:    { label: 'Bị từ chối / sửa lại', icon: <RotateCcw size={13}/>,    cls: 'bg-red-100 text-red-700' },
  PENDING:  { label: 'Gửi NV xác nhận',      icon: <Clock size={13}/>,        cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt (cũ)',        icon: <CheckCircle2 size={13}/>, cls: 'bg-green-100 text-green-700' },
  LOCKED:   { label: 'NV xác nhận đúng',     icon: <CheckCircle2 size={13}/>, cls: 'bg-green-100 text-green-700' },
  PAID:     { label: 'Đã thanh toán',        icon: <Banknote size={13}/>,     cls: 'bg-blue-100 text-blue-700' },
}

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error('fetch failed')
  return r.json()
})

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function ApprovalHistory({ payrollId }: { payrollId: string }) {
  const { data, error, isLoading } = useSWR<HistoryEntry[]>(
    payrollId ? `/api/payroll/${payrollId}/history` : null,
    fetcher
  )

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="text-sm font-bold text-gray-900 mb-3">Lịch sử duyệt</div>
        <div className="text-xs text-gray-400 py-4 text-center">Đang tải...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="text-sm font-bold text-gray-900 mb-3">Lịch sử duyệt</div>
        <div className="text-xs text-red-500 py-4 text-center">Lỗi khi tải lịch sử</div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} className="text-gray-400"/>
          <div className="text-sm font-bold text-gray-900">Lịch sử duyệt</div>
        </div>
        <div className="text-xs text-gray-400 py-4 text-center">Chưa có thay đổi trạng thái nào.</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={14} className="text-gray-400"/>
        <div className="text-sm font-bold text-gray-900">Lịch sử duyệt</div>
        <span className="text-[10px] text-gray-400">({data.length} bước)</span>
      </div>
      <ol className="relative border-l-2 border-gray-100 ml-3 space-y-4">
        {data.map(entry => {
          const meta = ACTION_META[entry.action] ?? {
            label: entry.action,
            icon: <FileText size={13}/>,
            cls: 'bg-gray-100 text-gray-600',
          }
          const note =
            typeof entry.changes === 'object' && entry.changes !== null
              ? (entry.changes as any).note ?? null
              : null
          return (
            <li key={entry.id} className="ml-5 relative">
              <div className={`absolute -left-[29px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${meta.cls}`}>
                {meta.icon}
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  Bởi: <span className="font-semibold">{entry.changedByName ?? 'Hệ thống'}</span>
                </div>
                {note && (
                  <div className="text-[11px] text-gray-500 mt-1 italic">"{note}"</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
