import { cn } from '@/lib/utils'
import type { KpiData } from '@/types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KpiCardProps {
  data: KpiData
}

const DeltaIcon = ({ type }: { type: KpiData['deltaType'] }) => {
  if (type === 'up')   return <TrendingUp size={12} />
  if (type === 'down') return <TrendingDown size={12} />
  return <Minus size={12} />
}

const deltaColor: Record<KpiData['deltaType'], string> = {
  up:   'text-green-600',
  down: 'text-red-600',
  warn: 'text-amber-600',
}

export default function KpiCard({ data }: KpiCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-5 py-5 relative overflow-hidden">
      {/* Accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
        style={{ background: data.accent }}
      />

      <div className="flex justify-between items-center mb-4">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
          {data.label}
        </span>
        <div className={cn('w-9 h-9 rounded-[10px] flex items-center justify-center', data.iconBg)}>
          <TrendingUp size={16} style={{ color: data.accent }} />
        </div>
      </div>

      <div className="text-2xl font-bold text-gray-900 mb-2.5 tracking-tight tabular-nums">
        {data.value}
      </div>

      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-semibold flex items-center gap-1', deltaColor[data.deltaType])}>
          <DeltaIcon type={data.deltaType} />
          {data.delta}
        </span>
        <span className="text-[11px] text-gray-400">{data.period}</span>
      </div>
    </div>
  )
}
