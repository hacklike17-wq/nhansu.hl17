import { Wallet, CalendarCheck, CalendarDays, AlertTriangle } from "lucide-react"
import StatCard from "./StatCard"
import AttendanceKpiPanel from "./AttendanceKpiPanel"
import type { EmployeeStats } from "@/app/_lib/dashboard-queries"

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  LOCKED: "Đã khoá",
  PAID: "Đã trả",
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  LOCKED: "bg-blue-50 text-blue-700 border-blue-200",
  PAID: "bg-purple-50 text-purple-700 border-purple-200",
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫"
}

export default function EmployeeDashboard({ stats, userName }: { stats: EmployeeStats; userName: string }) {
  const p = stats.myCurrentPayroll
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Chào {userName}</h1>
        <p className="text-xs text-gray-500 mt-0.5">Tổng quan cá nhân — tháng {stats.currentMonth}</p>
      </div>

      {/* My salary card — hero */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] font-medium text-blue-100 uppercase tracking-wider">
              Lương tháng {stats.currentMonth}
            </div>
            <div className="text-[10px] text-blue-200 mt-1">Thực nhận (net)</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
            <Wallet size={22}/>
          </div>
        </div>
        {p ? (
          <>
            <div className="text-3xl font-bold tracking-tight">
              {formatVnd(p.netSalary)}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-white/10 border-white/20`}>
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
              {p.needsRecalc && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-400/20 border border-amber-300/40">
                  <AlertTriangle size={11}/> Đang cập nhật
                </span>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-blue-200">Lương cơ bản</div>
                <div className="font-semibold mt-0.5">{formatVnd(p.baseSalary)}</div>
              </div>
              <div>
                <div className="text-blue-200">Tổng gross</div>
                <div className="font-semibold mt-0.5">{formatVnd(p.grossSalary)}</div>
              </div>
            </div>
            <a
              href="/luong"
              className="inline-flex items-center gap-1 mt-4 text-[11px] font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition"
            >
              Xem chi tiết →
            </a>
          </>
        ) : (
          <div className="text-sm text-blue-100 py-4">
            Chưa có bảng lương cho tháng này. Sẽ cập nhật khi phòng nhân sự tạo.
          </div>
        )}
      </div>

      {/* Side stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatCard
          label="Công đi làm tháng này"
          value={stats.myAttendanceThisMonth.toFixed(1)}
          hint="Công số đã ghi nhận"
          icon={<CalendarCheck size={18}/>}
          tone="green"
        />
        <StatCard
          label="Đơn xin nghỉ đang chờ"
          value={stats.myPendingLeaves}
          hint="Chờ phê duyệt"
          icon={<CalendarDays size={18}/>}
          tone="purple"
        />
      </div>

      <AttendanceKpiPanel
        initialKpi={stats.myAttendanceKpi}
        title="KPI chuyên cần của tôi"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <a href="/chamcong" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition">
          <div className="text-sm font-bold text-gray-900">Chấm công của tôi</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Xem lịch sử công làm</div>
        </a>
        <a href="/nghiphep" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition">
          <div className="text-sm font-bold text-gray-900">Xin nghỉ phép</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Tạo đơn xin nghỉ mới</div>
        </a>
      </div>
    </div>
  )
}
