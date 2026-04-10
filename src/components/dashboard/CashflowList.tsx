import { ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CASHFLOW_DATA } from '@/constants/data'

export default function CashflowList() {
  return (
    <div className="divide-y divide-gray-100">
      {CASHFLOW_DATA.map((item) => (
        <div key={item.id} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
          <div className={cn(
            'w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0',
            item.type === 'in' ? 'bg-green-50' : 'bg-red-50'
          )}>
            {item.type === 'in'
              ? <ArrowUp size={13} className="text-green-600" />
              : <ArrowDown size={13} className="text-red-600" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">{item.name}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{item.meta}</div>
          </div>
          <div className={cn('text-[13px] font-bold whitespace-nowrap',
            item.type === 'in' ? 'text-green-600' : 'text-red-600'
          )}>
            {item.amount}
          </div>
        </div>
      ))}
    </div>
  )
}
