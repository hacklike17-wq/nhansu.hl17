'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { LEAVE_DATA } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { fmtDate } from '@/lib/format'
import { Search } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved:  { label: 'Đã duyệt',  cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected:  { label: 'Từ chối',   cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Đã hủy',    cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const TYPE_MAP: Record<string, string> = {
  annual: 'Phép năm', sick: 'Ốm đau', personal: 'Việc riêng',
  maternity: 'Thai sản', unpaid: 'Không lương', wedding: 'Kết hôn', bereavement: 'Tang sự',
}

export default function NghiPhepPage() {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const statsBase = isEmployee
    ? LEAVE_DATA.filter(r => r.employeeId === user?.employeeId)
    : LEAVE_DATA

  const filtered = LEAVE_DATA.filter(r => {
    if (isEmployee && r.employeeId !== user?.employeeId) return false
    if (search && !r.employeeName.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && r.status !== statusFilter) return false
    return true
  })

  return (
    <PageShell breadcrumb="Nhân sự" title="Nghỉ phép">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: isEmployee ? 'Đơn của tôi' : 'Tổng đơn', value: statsBase.length },
          { label: 'Chờ duyệt', value: statsBase.filter(r => r.status === 'pending').length },
          { label: 'Đã duyệt', value: statsBase.filter(r => r.status === 'approved').length },
          { label: 'Từ chối', value: statsBase.filter(r => r.status === 'rejected').length },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[11px] text-gray-500 font-medium">{s.label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          {!isEmployee && (
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhân viên..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {!isEmployee && <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Nhân viên</th>}
                {!isEmployee && <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Phòng ban</th>}
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Loại nghỉ</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Từ ngày</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Đến ngày</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Số ngày</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Lý do</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Người duyệt</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const st = STATUS_MAP[r.status]
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                    {!isEmployee && <td className="px-4 py-2.5 font-medium text-gray-900">{r.employeeName}</td>}
                    {!isEmployee && <td className="px-4 py-2.5 text-gray-600">{r.department}</td>}
                    <td className="px-4 py-2.5 text-gray-600">{TYPE_MAP[r.type]}</td>
                    <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.startDate)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.endDate)}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-gray-900">{r.days}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">{r.reason}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.approver}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  )
}
