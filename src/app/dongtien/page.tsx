'use client'
import PageShell from '@/components/layout/PageShell'
import { CASHFLOW_DATA } from '@/constants/data'
import { fmtVND, fmtDate } from '@/lib/format'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function DongTienPage() {
  const totalIn = CASHFLOW_DATA.filter(r => r.type === 'in').reduce((s, r) => s + r.rawAmount, 0)
  const totalOut = CASHFLOW_DATA.filter(r => r.type === 'out').reduce((s, r) => s + Math.abs(r.rawAmount), 0)
  const netFlow = totalIn - totalOut
  const lastBalance = CASHFLOW_DATA[0]?.balance || 0

  return (
    <PageShell breadcrumb="Tài chính" title="Dòng tiền">
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 border-t-2 border-t-blue-500">
          <div className="text-[11px] text-gray-500">Số dư hiện tại</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{fmtVND(lastBalance)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 border-t-2 border-t-green-500">
          <div className="text-[11px] text-gray-500">Tổng thu</div>
          <div className="text-xl font-bold text-green-600 mt-1">+{fmtVND(totalIn)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 border-t-2 border-t-red-500">
          <div className="text-[11px] text-gray-500">Tổng chi</div>
          <div className="text-xl font-bold text-red-600 mt-1">-{fmtVND(totalOut)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 border-t-2 border-t-purple-500">
          <div className="text-[11px] text-gray-500">Dòng tiền ròng</div>
          <div className={`text-xl font-bold mt-1 ${netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {netFlow >= 0 ? '+' : ''}{fmtVND(netFlow)} đ
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[13px] font-bold text-gray-900">Lịch sử dòng tiền</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Tháng 4/2026</p>
        </div>
        <div className="divide-y divide-gray-50">
          {CASHFLOW_DATA.map(r => (
            <div key={r.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-blue-50/30 transition-colors">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${r.type === 'in' ? 'bg-green-50' : 'bg-red-50'}`}>
                {r.type === 'in'
                  ? <ArrowUpRight size={16} className="text-green-600" />
                  : <ArrowDownRight size={16} className="text-red-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">{r.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{r.description}</div>
              </div>
              <div className="text-[11px] text-gray-400 shrink-0">{r.meta}</div>
              <div className={`text-sm font-bold shrink-0 ${r.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                {r.amount}
              </div>
              <div className="text-[11px] text-gray-400 w-24 text-right shrink-0">
                Số dư: {fmtVND(r.balance)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
