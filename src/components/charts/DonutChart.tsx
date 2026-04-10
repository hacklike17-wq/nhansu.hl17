'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { DONUT_DATA } from '@/constants/data'

export default function DonutChart() {
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={96} height={96}>
        <PieChart>
          <Pie data={DONUT_DATA} cx="50%" cy="50%" innerRadius={30} outerRadius={46}
            dataKey="value" stroke="none">
            {DONUT_DATA.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 11, border: '1px solid #E4E7EF', borderRadius: 6 }}
            formatter={(v) => [`${v}%`, undefined]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {DONUT_DATA.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: d.color }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-bold text-gray-900">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
