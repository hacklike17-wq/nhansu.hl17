'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { EXPENSE_DATA } from '@/constants/data'
import { fmtVND, fmtDate } from '@/lib/format'
import { Search, Download } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Đã duyệt',  cls: 'bg-green-50 text-green-700 border-green-200' },
  pending:  { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  rejected: { label: 'Từ chối',   cls: 'bg-red-50 text-red-700 border-red-200' },
}

const CAT_MAP: Record<string, string> = {
  salary:'Lương', rent:'Thuê mặt bằng', utilities:'Tiện ích', marketing:'Marketing',
  equipment:'Thiết bị', travel:'Công tác', insurance:'Bảo hiểm', tax:'Thuế', other:'Khác',
}

export default function ChiPhiPage() {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')

  const filtered = EXPENSE_DATA.filter(r => {
    if (search && !r.vendor.toLowerCase().includes(search.toLowerCase()) && !r.description.toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter && r.category !== catFilter) return false
    return true
  })

  const total = filtered.reduce((s, r) => s + r.amount, 0)

  return (
    <PageShell breadcrumb="Tài chính" title="Chi phí">
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Tổng chi phí</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{fmtVND(total)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Đã duyệt</div>
          <div className="text-xl font-bold text-green-600 mt-1">{fmtVND(filtered.filter(r=>r.status==='approved').reduce((s,r)=>s+r.amount,0))} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Chờ duyệt</div>
          <div className="text-xl font-bold text-amber-600 mt-1">{fmtVND(filtered.filter(r=>r.status==='pending').reduce((s,r)=>s+r.amount,0))} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Số phiếu chi</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{filtered.length}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhà cung cấp, mô tả..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <option value="">Tất cả loại</option>
            {Object.entries(CAT_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <Download size={13} /> Xuất Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ngày</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Nhà cung cấp</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Mô tả</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Phân loại</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Phòng ban</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Số tiền</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Người duyệt</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-gray-400">
                    Chưa có khoản chi phí nào. Hãy thêm bản ghi đầu tiên.
                  </td>
                </tr>
              ) : (
                filtered.map(r => {
                  const st = STATUS_MAP[r.status]
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                      <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.date)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.vendor}</td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">{r.description}</td>
                      <td className="px-4 py-2.5 text-gray-600">{CAT_MAP[r.category]}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.department}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmtVND(r.amount)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.approver}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  )
}
