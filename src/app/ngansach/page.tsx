'use client'
import PageShell from '@/components/layout/PageShell'
import { BUDGET_DETAIL_DATA } from '@/constants/data'
import { fmtVND } from '@/lib/format'

const STATUS_CLS: Record<string, string> = {
  under:    'bg-green-50 text-green-700 border-green-200',
  on_track: 'bg-blue-50 text-blue-700 border-blue-200',
  over:     'bg-red-50 text-red-700 border-red-200',
}
const STATUS_LABEL: Record<string, string> = {
  under: 'Dưới KH', on_track: 'Đúng KH', over: 'Vượt KH',
}

export default function NganSachPage() {
  const totalPlanned = BUDGET_DETAIL_DATA.reduce((s, r) => s + r.planned, 0)
  const totalActual = BUDGET_DETAIL_DATA.reduce((s, r) => s + r.actual, 0)
  const totalRemaining = totalPlanned - totalActual
  const overallPct = Math.round((totalActual / totalPlanned) * 100)

  return (
    <PageShell breadcrumb="Tài chính" title="Ngân sách">
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Tổng kế hoạch</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{fmtVND(totalPlanned)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Đã sử dụng</div>
          <div className="text-xl font-bold text-blue-600 mt-1">{fmtVND(totalActual)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Còn lại</div>
          <div className="text-xl font-bold text-green-600 mt-1">{fmtVND(totalRemaining)} đ</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Tỷ lệ sử dụng</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{overallPct}%</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[13px] font-bold text-gray-900">Chi tiết ngân sách Q2/2026</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Hạng mục</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Phòng ban</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Kế hoạch</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Thực tế</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Còn lại</th>
                <th className="px-4 py-2.5 font-semibold text-gray-500 w-40">Tiến độ</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {BUDGET_DETAIL_DATA.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                  <td className="px-4 py-3 font-semibold text-gray-900">{r.category}</td>
                  <td className="px-4 py-3 text-gray-600">{r.department}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtVND(r.planned)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtVND(r.actual)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtVND(r.remaining)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(r.pct, 100)}%`, background: r.color }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-gray-600 w-8 text-right">{r.pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${STATUS_CLS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  )
}
