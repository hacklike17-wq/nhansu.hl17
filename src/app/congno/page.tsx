'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { DEBT_DATA } from '@/constants/data'
import { fmtVND, fmtDate } from '@/lib/format'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  current:  { label: 'Trong hạn',    cls: 'bg-green-50 text-green-700 border-green-200' },
  overdue:  { label: 'Quá hạn',      cls: 'bg-red-50 text-red-700 border-red-200' },
  paid:     { label: 'Đã thanh toán', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  bad_debt: { label: 'Nợ xấu',       cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export default function CongNoPage() {
  const [tab, setTab] = useState<'receivable' | 'payable'>('receivable')

  const data = DEBT_DATA.filter(r => r.type === tab)
  const totalAmount = data.reduce((s, r) => s + r.amount, 0)
  const totalRemaining = data.reduce((s, r) => s + r.remaining, 0)
  const overdue = data.filter(r => r.status === 'overdue')

  return (
    <PageShell breadcrumb="Tài chính" title="Công nợ">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 border border-gray-200 rounded-xl p-1 w-fit">
        {([['receivable', 'Phải thu'], ['payable', 'Phải trả']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-lg text-xs font-medium transition-all ${tab === key ? 'bg-white text-gray-900 font-semibold border border-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Tổng {tab === 'receivable' ? 'phải thu' : 'phải trả'}</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{fmtVND(totalAmount)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Còn lại</div>
          <div className={`text-xl font-bold mt-1 ${tab === 'receivable' ? 'text-blue-600' : 'text-red-600'}`}>{fmtVND(totalRemaining)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Quá hạn</div>
          <div className="text-xl font-bold text-red-600 mt-1">{overdue.length} khoản</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Đã thanh toán</div>
          <div className="text-xl font-bold text-green-600 mt-1">{data.filter(r => r.status === 'paid').length} khoản</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Đối tác</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Liên hệ</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Số HĐ</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Tổng nợ</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Đã TT</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Còn lại</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Hạn TT</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-xs text-gray-400">
                    Chưa có khoản {tab === 'receivable' ? 'phải thu' : 'phải trả'} nào.
                  </td>
                </tr>
              ) : (
                data.map(r => {
                  const st = STATUS_MAP[r.status]
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.company}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.contactPerson}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-500">{r.invoiceNo}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtVND(r.amount)}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{fmtVND(r.paid)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmtVND(r.remaining)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.dueDate)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${st.cls}`}>
                          {st.label}
                          {r.daysOverdue > 0 && ` (${r.daysOverdue}d)`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-[150px] truncate">{r.note}</td>
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
