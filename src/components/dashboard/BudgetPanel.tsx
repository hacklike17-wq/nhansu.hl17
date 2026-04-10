import { BUDGET_DATA } from '@/constants/data'

export default function BudgetPanel() {
  return (
    <div className="space-y-3">
      {BUDGET_DATA.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between mb-1.5">
            <span className="text-[12.5px] font-medium text-gray-500">{item.label}</span>
            <span className="text-xs font-bold" style={{ color: item.color }}>{item.pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${item.pct}%`, background: item.color }}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-between items-center border-t border-gray-100 pt-3 mt-3.5">
        <span className="text-[11.5px] text-gray-400">Tổng đã dùng</span>
        <span className="text-sm font-bold text-gray-900">2.860.000.000</span>
      </div>
    </div>
  )
}
