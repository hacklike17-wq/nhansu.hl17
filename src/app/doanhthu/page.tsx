'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { REVENUE_DATA } from '@/constants/data'
import { fmtVND, fmtDate } from '@/lib/format'
import { Search, Download, TrendingUp } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Xác nhận',  cls: 'bg-green-50 text-green-700 border-green-200' },
  pending:   { label: 'Chờ TT',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled: { label: 'Hủy',       cls: 'bg-red-50 text-red-700 border-red-200' },
}

const CAT_MAP: Record<string, string> = {
  product: 'Sản phẩm', service: 'Dịch vụ', consulting: 'Tư vấn', investment: 'Đầu tư', other: 'Khác',
}

export default function DoanhThuPage() {
  const [search, setSearch] = useState('')

  const filtered = REVENUE_DATA.filter(r => {
    if (search && !r.customer.toLowerCase().includes(search.toLowerCase()) && !r.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const total = filtered.reduce((s, r) => s + r.amount, 0)
  const confirmed = filtered.filter(r => r.status === 'confirmed').reduce((s, r) => s + r.amount, 0)
  const pending = filtered.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)

  return (
    <PageShell breadcrumb="Tài chính" title="Doanh thu">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 border-t-2 border-t-blue-500">
          <div className="text-[11px] text-gray-500 font-medium flex items-center gap-1"><TrendingUp size={12}/> Tổng doanh thu</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{fmtVND(total)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 border-t-2 border-t-green-500">
          <div className="text-[11px] text-gray-500 font-medium">Đã xác nhận</div>
          <div className="text-xl font-bold text-green-600 mt-1">{fmtVND(confirmed)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 border-t-2 border-t-amber-500">
          <div className="text-[11px] text-gray-500 font-medium">Chờ thanh toán</div>
          <div className="text-xl font-bold text-amber-600 mt-1">{fmtVND(pending)} đ</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm khách hàng, mô tả..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <button className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <Download size={13} /> Xuất Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ngày</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Khách hàng</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Mô tả</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Phân loại</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Số HĐ</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Số tiền</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const st = STATUS_MAP[r.status]
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                    <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.customer}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[250px] truncate">{r.description}</td>
                    <td className="px-4 py-2.5 text-gray-600">{CAT_MAP[r.category]}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-500">{r.invoiceNo}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmtVND(r.amount)}</td>
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
          {filtered.length} giao dịch · Tổng: <strong className="text-gray-900">{fmtVND(total)} đ</strong>
        </div>
      </div>
    </PageShell>
  )
}
