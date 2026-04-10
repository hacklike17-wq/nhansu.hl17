'use client'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { REVENUE_CHART_DATA } from '@/constants/data'

const fmtVal = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}B` : `${v}`

export default function RevenueChart() {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={REVENUE_CHART_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9DA3BA' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtVal} tick={{ fontSize: 10, fill: '#9DA3BA' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid #E4E7EF', borderRadius: 8, fontSize: 12 }}
          formatter={(v) => { const n = Number(v); return [`${n >= 1000 ? (n/1000).toFixed(1) + ' tỷ' : n + ' tr'}`, undefined] }}
        />
        <Bar dataKey="revenue" name="Doanh thu" fill="rgba(37,99,235,0.12)" stroke="#2563EB" strokeWidth={1.5} radius={[6,6,0,0]} barSize={28} />
        <Bar dataKey="expense"  name="Chi phí"   fill="rgba(245,158,11,0.12)" stroke="#F59E0B" strokeWidth={1.5} radius={[6,6,0,0]} barSize={28} />
        <Line dataKey="profit" name="Lợi nhuận" type="monotone" stroke="#16A34A" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#16A34A' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
