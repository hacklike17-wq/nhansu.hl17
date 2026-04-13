import { Wallet, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, FileText } from "lucide-react"
import AttendanceKpiPanel from "./AttendanceKpiPanel"
import MyProfileCard from "./MyProfileCard"
import MySalaryHistoryChart from "./MySalaryHistoryChart"
import MyAttendanceMiniStats from "./MyAttendanceMiniStats"
import type { EmployeeStats } from "@/app/_lib/dashboard-queries"

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ bạn xác nhận",
  APPROVED: "Đã duyệt",
  LOCKED: "Đã xác nhận",
  PAID: "Đã thanh toán",
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫"
}

function computeDelta(
  current: number | null,
  previous: number | null
): { pct: number; label: string; tone: "up" | "down" | "flat" | "first" } {
  if (current === null || current === undefined) return { pct: 0, label: "—", tone: "flat" }
  if (previous === null || previous === undefined) return { pct: 0, label: "Lần đầu", tone: "first" }
  if (previous === 0) return { pct: 0, label: "—", tone: "flat" }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.05) return { pct: 0, label: "0%", tone: "flat" }
  const sign = pct > 0 ? "+" : ""
  return {
    pct,
    label: `${sign}${pct.toFixed(1)}%`,
    tone: pct > 0 ? "up" : "down",
  }
}

export default function EmployeeDashboard({
  stats,
  userName,
}: {
  stats: EmployeeStats
  userName: string
}) {
  const p = stats.myCurrentPayroll
  const delta = computeDelta(p?.netSalary ?? null, stats.myPreviousMonthNet)

  const DeltaIcon =
    delta.tone === "up" ? ArrowUpRight : delta.tone === "down" ? ArrowDownRight : Minus
  const deltaCls =
    delta.tone === "up"
      ? "text-green-300"
      : delta.tone === "down"
        ? "text-red-300"
        : "text-blue-200"

  return (
    <div className="space-y-4">
      {/* Row 1 — Header */}
      <div>
        <h1 className="text-lg font-bold text-gray-900">Chào {userName}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {stats.myProfile?.position ? `${stats.myProfile.position} · ` : ""}
          Tháng {stats.currentMonth}
        </p>
      </div>

      {/* Row 2 — Hero salary + Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        {/* 2A — Hero salary */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/5 rounded-full" />
          <div className="absolute -right-12 -bottom-12 w-40 h-40 bg-white/5 rounded-full" />

          <div className="relative flex items-start justify-between mb-4">
            <div>
              <div className="text-[11px] font-medium text-blue-100 uppercase tracking-wider">
                Lương tháng {stats.currentMonth}
              </div>
              <div className="text-[10px] text-blue-200 mt-1">Thực nhận (net)</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <Wallet size={22} />
            </div>
          </div>

          {p ? (
            <>
              <div className="relative text-3xl md:text-4xl font-bold tracking-tight tabular-nums">
                {formatVnd(p.netSalary)}
              </div>

              {/* Delta vs previous month */}
              <div className={`relative mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${deltaCls}`}>
                <DeltaIcon size={14} />
                <span>{delta.label}</span>
                {delta.tone !== "first" && delta.tone !== "flat" && (
                  <span className="text-[10px] text-blue-200 font-normal">so với tháng trước</span>
                )}
              </div>

              {/* Status badges */}
              <div className="relative flex items-center gap-2 mt-3 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-white/10 border-white/20">
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                {p.needsRecalc && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-400/20 border border-amber-300/40">
                    <AlertTriangle size={11} /> Đang cập nhật
                  </span>
                )}
              </div>

              <div className="relative mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="text-blue-200">Lương cơ bản</div>
                  <div className="font-semibold mt-0.5 tabular-nums">{formatVnd(p.baseSalary)}</div>
                </div>
                <div>
                  <div className="text-blue-200">Tổng gross</div>
                  <div className="font-semibold mt-0.5 tabular-nums">{formatVnd(p.grossSalary)}</div>
                </div>
              </div>

              <a
                href="/luong"
                className="relative inline-flex items-center gap-1 mt-4 text-[11px] font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition"
              >
                Xem chi tiết →
              </a>
            </>
          ) : (
            <div className="relative text-sm text-blue-100 py-4">
              Chưa có bảng lương cho tháng này. Sẽ cập nhật khi phòng nhân sự tạo.
            </div>
          )}
        </div>

        {/* 2B — Profile */}
        <MyProfileCard profile={stats.myProfile} />
      </div>

      {/* Row 3 — Salary history chart */}
      <MySalaryHistoryChart />

      {/* Row 4 — 4 mini stat cards */}
      <MyAttendanceMiniStats />

      {/* Row 5 — KPI panel */}
      <AttendanceKpiPanel
        initialKpi={stats.myAttendanceKpi}
        title="KPI chuyên cần của tôi"
      />

      {/* Row 6 — Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <a
          href="/luong"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <div>
              <div className="text-sm font-bold text-gray-900">Bảng lương chi tiết</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Xem & xác nhận lương tháng</div>
            </div>
          </div>
        </a>
        <a
          href="/chamcong"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-green-600" />
            <div>
              <div className="text-sm font-bold text-gray-900">Chấm công của tôi</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Xem lịch sử công làm</div>
            </div>
          </div>
        </a>
        <a
          href="/khong-luong"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-rose-600" />
            <div>
              <div className="text-sm font-bold text-gray-900">Xin nghỉ không lương</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Tạo đơn xin nghỉ mới</div>
            </div>
          </div>
        </a>
      </div>
    </div>
  )
}
