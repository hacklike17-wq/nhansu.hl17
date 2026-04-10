'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { SALARY_DATA } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { fmtVND } from '@/lib/format'
import { Search, Download, Eye, EyeOff } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Nháp',      cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  pending:  { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Đã duyệt',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid:     { label: 'Đã trả',    cls: 'bg-green-50 text-green-700 border-green-200' },
}

const COLUMNS = [
  { key: 'baseSalary', label: 'Lương cứng' },
  { key: 'kpiAttendance', label: 'KPI Chuyên cần' },
  { key: 'kpiPerformance', label: 'KPI Hiệu suất' },
  { key: 'overtimePay', label: 'Lương OT' },
  { key: 'bonus', label: 'Thưởng' },
  { key: 'deductions', label: 'Khấu trừ (BH)' },
  { key: 'tax', label: 'Thuế TNCN' },
  { key: 'totalGross', label: 'Tổng gross' },
  { key: 'totalNet', label: 'Thực nhận' },
] as const

export default function LuongPage() {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'

  const [search, setSearch] = useState('')
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(COLUMNS.map(c => c.key)))
  const [showColPicker, setShowColPicker] = useState(false)

  const toggleCol = (key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = SALARY_DATA.filter(r => {
    if (isEmployee && r.employeeId !== user?.employeeId) return false
    if (search && !r.employeeName.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalNet = filtered.reduce((s, r) => s + r.totalNet, 0)
  const totalGross = filtered.reduce((s, r) => s + r.totalGross, 0)

  return (
    <PageShell breadcrumb="Nhân sự" title="Lương & thưởng">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500 font-medium">
            {isEmployee ? 'Lương của tôi (Gross)' : 'Tổng quỹ lương (Gross)'}
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">{fmtVND(totalGross)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500 font-medium">
            {isEmployee ? 'Lương thực nhận' : 'Tổng thực chi (Net)'}
          </div>
          <div className="text-lg font-bold text-blue-600 mt-1">{fmtVND(totalNet)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500 font-medium">Đã trả lương</div>
          <div className="text-lg font-bold text-green-600 mt-1">{filtered.filter(r => r.status === 'paid').length} / {filtered.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500 font-medium">Chờ duyệt</div>
          <div className="text-lg font-bold text-amber-600 mt-1">{filtered.filter(r => r.status === 'pending').length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          {!isEmployee && (
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhân viên..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          )}
          <div className="relative">
            <button onClick={() => setShowColPicker(!showColPicker)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              {showColPicker ? <EyeOff size={13}/> : <Eye size={13}/>} Cột hiển thị
            </button>
            {showColPicker && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 w-48">
                {COLUMNS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-xs">
                    <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)} className="rounded" />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Tháng 4/2026</span>
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
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 sticky left-0 bg-gray-50/50">Nhân viên</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Phòng ban</th>
                {COLUMNS.filter(c => visibleCols.has(c.key)).map(c => (
                  <th key={c.key} className="text-right px-4 py-2.5 font-semibold text-gray-500 whitespace-nowrap">{c.label}</th>
                ))}
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const st = STATUS_MAP[r.status]
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                    <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 bg-white">{r.employeeName}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.department}</td>
                    {COLUMNS.filter(c => visibleCols.has(c.key)).map(c => {
                      const val = r[c.key as keyof typeof r] as number
                      const isKpi = c.key.startsWith('kpi')
                      return (
                        <td key={c.key} className={`px-4 py-2.5 text-right font-medium ${c.key === 'totalNet' ? 'text-blue-600 font-bold' : c.key === 'deductions' || c.key === 'tax' ? 'text-red-600' : 'text-gray-900'}`}>
                          {isKpi ? `${val}%` : fmtVND(val)}
                        </td>
                      )
                    })}
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-[11px] text-gray-500">
          {filtered.length} nhân viên · {isEmployee ? 'Lương thực nhận:' : 'Tổng thực chi:'} <span className="font-bold text-blue-600">{fmtVND(totalNet)} đ</span>
        </div>
      </div>
    </PageShell>
  )
}
