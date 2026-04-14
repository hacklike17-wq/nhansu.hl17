'use client'
/**
 * Sidebar card showing today's solar + lunar date. Replaces the old
 * placeholder "Workspace 04 · 2026" that never did anything.
 *
 * SSR-safe: we initialize state to `null` and fill it in via useEffect so
 * server and client render the same placeholder until hydration — no risk
 * of a hydration mismatch from `new Date()` differing between the two.
 * A midnight timer keeps the card in sync if the app stays mounted across
 * a day boundary.
 */
import { useEffect, useState } from "react"
import { CalendarDays } from "lucide-react"
import { solarToLunar, getYearCanChi, dowLabelVN } from "@/lib/lunar"

export default function LunarCalendarCard() {
  const [today, setToday] = useState<Date | null>(null)

  useEffect(() => {
    setToday(new Date())
    // Re-render at the next midnight so a long-lived tab stays correct.
    const now = new Date()
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      5 // 5-second buffer to avoid edge-of-day rounding
    )
    const ms = nextMidnight.getTime() - now.getTime()
    const t = setTimeout(() => setToday(new Date()), ms)
    return () => clearTimeout(t)
  }, [])

  if (!today) {
    // SSR placeholder — same box shape so layout doesn't shift on hydration.
    return (
      <div className="mx-3.5 my-3 bg-gray-50 border border-gray-200 rounded-[10px] px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
          <CalendarDays size={14} className="text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-gray-900">Hôm nay</div>
          <div className="text-[10px] text-gray-400">Đang tải...</div>
        </div>
      </div>
    )
  }

  const dow = dowLabelVN(today)
  const dd = today.getDate()
  const mm = today.getMonth() + 1
  const yy = today.getFullYear()
  const lunar = solarToLunar(dd, mm, yy)
  const canChi = getYearCanChi(lunar.year)

  return (
    <div
      className="mx-3.5 my-3 bg-gray-50 border border-gray-200 rounded-[10px] px-3 py-2.5 flex items-center gap-2.5"
      title={`Dương lịch: ${dow}, ngày ${dd}/${mm}/${yy}\nÂm lịch: ngày ${lunar.day}${lunar.leap ? ' nhuận' : ''} tháng ${lunar.month} năm ${canChi}`}
    >
      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
        <CalendarDays size={14} className="text-amber-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-gray-900 truncate">
          {dow} · {dd}/{mm}
        </div>
        <div className="text-[10px] text-gray-400 truncate">
          ÂL {lunar.day}/{lunar.month}
          {lunar.leap ? ' (nhuận)' : ''} · {canChi}
        </div>
      </div>
    </div>
  )
}
