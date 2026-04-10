'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { ATTENDANCE_DATA, DEPARTMENTS } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { Search, Download, Calendar } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  on_time:     { label: 'Đúng giờ',   cls: 'bg-green-50 text-green-700 border-green-200' },
  late:        { label: 'Đi muộn',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  early_leave: { label: 'Về sớm',     cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  absent:      { label: 'Vắng mặt',   cls: 'bg-red-50 text-red-700 border-red-200' },
  leave:       { label: 'Nghỉ phép',  cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  remote:      { label: 'Remote',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

export default function ChamCongPage() {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'

  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('2026-04-09')
  const [deptFilter, setDeptFilter] = useState('')

  const filtered = ATTENDANCE_DATA.filter(r => {
    if (isEmployee && r.employeeId !== user?.employeeId) return false
    if (search && !r.employeeName.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFilter && r.date !== dateFilter) return false
    if (deptFilter && r.department !== deptFilter) return false
    return true
  })

  const stats = {
    total: filtered.length,
    onTime: filtered.filter(r => r.status === 'on_time').length,
    late: filtered.filter(r => r.status === 'late').length,
    leave: filtered.filter(r => r.status === 'leave').length,
    remote: filtered.filter(r => r.status === 'remote').length,
  }

  return (
    <PageShell breadcrumb="Nhân sự" title="Chấm công">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: isEmployee ? 'Ngày của tôi' : 'Tổng', value: stats.total, color: 'border-t-gray-400' },
          { label: 'Đúng giờ', value: stats.onTime, color: 'border-t-green-500' },
          { label: 'Đi muộn', value: stats.late, color: 'border-t-amber-500' },
          { label: 'Nghỉ phép', value: stats.leave, color: 'border-t-purple-500' },
          { label: 'Remote', value: stats.remote, color: 'border-t-blue-500' },
        ].map(s => (
          <div key={s.label} className={`bg-white border border-gray-200 ${s.color} border-t-2 rounded-xl p-3.5`}>
            <div className="text-[11px] text-gray-500 font-medium">{s.label}</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          {!isEmployee && (
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhân viên..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-gray-400" />
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50" />
          </div>
          {!isEmployee && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600">
              <option value="">Tất cả phòng ban</option>
              {DEPARTMENTS.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          )}
          {!isEmployee && (
            <button className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Download size={13} /> Xuất Excel
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Nhân viên</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Phòng ban</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ngày</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Vào</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Ra</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">OT (giờ)</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const st = STATUS_MAP[r.status]
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.employeeName}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.department}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.date}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-700">{r.checkIn}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-700">{r.checkOut}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{r.overtime > 0 ? r.overtime : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-[11px] text-gray-500">
          {filtered.length} bản ghi
        </div>
      </div>
    </PageShell>
  )
}
