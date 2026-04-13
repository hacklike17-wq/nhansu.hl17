import type { ReactNode } from "react"

type Tone = "blue" | "green" | "amber" | "red" | "purple" | "gray"

const TONE_STYLES: Record<Tone, { icon: string; accent: string }> = {
  blue:   { icon: "bg-blue-50 text-blue-600",     accent: "text-blue-700" },
  green:  { icon: "bg-green-50 text-green-600",   accent: "text-green-700" },
  amber:  { icon: "bg-amber-50 text-amber-600",   accent: "text-amber-700" },
  red:    { icon: "bg-red-50 text-red-600",       accent: "text-red-700" },
  purple: { icon: "bg-purple-50 text-purple-600", accent: "text-purple-700" },
  gray:   { icon: "bg-gray-100 text-gray-600",    accent: "text-gray-700" },
}

type Props = {
  label: string
  value: string | number
  hint?: string
  icon: ReactNode
  tone?: Tone
}

export default function StatCard({ label, value, hint, icon, tone = "blue" }: Props) {
  const t = TONE_STYLES[tone]
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.icon}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-gray-500 font-medium">{label}</div>
        <div className={`text-xl font-bold ${t.accent} mt-0.5 truncate`}>{value}</div>
        {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
      </div>
    </div>
  )
}
