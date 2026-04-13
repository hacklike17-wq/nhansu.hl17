import { Users, Clock, CalendarDays } from "lucide-react"
import StatCard from "./StatCard"
import AttendanceKpiPanel from "./AttendanceKpiPanel"
import type { ManagerStats } from "@/app/_lib/dashboard-queries"

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  LOCKED: "Đã khoá",
  PAID: "Đã trả",
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  LOCKED: "bg-blue-50 text-blue-700",
  PAID: "bg-purple-50 text-purple-700",
}

export default function ManagerDashboard({ stats, userName }: { stats: ManagerStats; userName: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Chào {userName}</h1>
        <p className="text-xs text-gray-500 mt-0.5">Tổng quan quản lý — tháng {stats.currentMonth}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Tổng nhân viên" value={stats.totalEmployees} icon={<Users size={18}/>} tone="blue" />
        <StatCard
          label="Chờ duyệt lương"
          value={stats.pendingPayrolls}
          hint="Chờ Admin duyệt"
          icon={<Clock size={18}/>}
          tone="amber"
        />
        <StatCard
          label="Nghỉ phép chờ duyệt"
          value={stats.pendingLeaves}
          icon={<CalendarDays size={18}/>}
          tone="purple"
        />
      </div>

      <AttendanceKpiPanel
        kpi={stats.attendanceKpi}
        subtitle={`KPI chuyên cần toàn công ty · tháng ${stats.currentMonth}`}
      />

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-bold text-gray-900 mb-3">Trạng thái bảng lương tháng {stats.currentMonth}</div>
        {stats.currentMonthPayrollStatus.length === 0 ? (
          <div className="text-xs text-gray-400 py-6 text-center">
            Chưa có bảng lương nào cho tháng này.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stats.currentMonthPayrollStatus.map(s => (
              <div
                key={s.status}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[s.status] ?? "bg-gray-100 text-gray-700"}`}
              >
                {STATUS_LABEL[s.status] ?? s.status}: <span className="font-bold">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <a href="/luong" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition">
          <div className="text-sm font-bold text-gray-900">Bảng lương</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Xem và chỉnh sửa lương nhân viên</div>
        </a>
        <a href="/chamcong" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition">
          <div className="text-sm font-bold text-gray-900">Chấm công</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Quản lý công số nhân viên</div>
        </a>
      </div>
    </div>
  )
}
