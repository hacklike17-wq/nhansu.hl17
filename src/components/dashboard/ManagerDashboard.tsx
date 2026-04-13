import { Calendar, Wallet, Ban } from "lucide-react"
import AttendanceKpiPanel from "./AttendanceKpiPanel"
import ManagerTodayPulse from "./ManagerTodayPulse"
import ManagerActionQueue from "./ManagerActionQueue"
import ManagerMonthProgress from "./ManagerMonthProgress"
import ManagerTeamTable from "./ManagerTeamTable"
import type { ManagerStats } from "@/app/_lib/dashboard-queries"

export default function ManagerDashboard({
  stats,
  userName,
}: {
  stats: ManagerStats
  userName: string
}) {
  return (
    <div className="space-y-4">
      {/* Row 1 — Header */}
      <div>
        <h1 className="text-lg font-bold text-gray-900">Chào {userName}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Quản lý nhân sự · Tháng {stats.currentMonth}
        </p>
      </div>

      {/* Row 2 — Today's pulse (4 mini cards) */}
      <ManagerTodayPulse />

      {/* Row 3 — Action queue (left) + Month progress (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3">
        <ManagerActionQueue />
        <ManagerMonthProgress />
      </div>

      {/* Row 4 — Team table (centerpiece) */}
      <ManagerTeamTable />

      {/* Row 5 — KPI panel (giữ lại — already syncs with chamcong via SWR) */}
      <AttendanceKpiPanel
        initialKpi={stats.attendanceKpi}
        title="KPI chuyên cần toàn công ty"
      />

      {/* Row 6 — Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <a
          href="/chamcong"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-green-600" />
            <div>
              <div className="text-sm font-bold text-gray-900">Chấm công</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Nhập công hàng ngày</div>
            </div>
          </div>
        </a>
        <a
          href="/luong"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-blue-600" />
            <div>
              <div className="text-sm font-bold text-gray-900">Bảng lương</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Tính lương tháng</div>
            </div>
          </div>
        </a>
        <a
          href="/khong-luong"
          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-2">
            <Ban size={16} className="text-rose-600" />
            <div>
              <div className="text-sm font-bold text-gray-900">Nghỉ không lương</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Duyệt đơn nghỉ</div>
            </div>
          </div>
        </a>
      </div>
    </div>
  )
}
