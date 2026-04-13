import { Users, UserCheck, Clock, CheckCircle2, CalendarDays, Wallet } from "lucide-react"
import StatCard from "./StatCard"
import AttendanceKpiPanel from "./AttendanceKpiPanel"
import type { AdminStats } from "@/app/_lib/dashboard-queries"

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫"
}

export default function AdminDashboard({ stats, userName }: { stats: AdminStats; userName: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Chào {userName}</h1>
        <p className="text-xs text-gray-500 mt-0.5">Tổng quan quản trị viên — tháng {stats.currentMonth}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Tổng nhân viên" value={stats.totalEmployees} icon={<Users size={18}/>} tone="blue" />
        <StatCard label="Tài khoản hoạt động" value={stats.activeAccounts} icon={<UserCheck size={18}/>} tone="green" />
        <StatCard label="Chờ duyệt lương" value={stats.pendingPayrolls} hint="Cần admin xử lý" icon={<Clock size={18}/>} tone="amber" />
        <StatCard label="Đã duyệt / khoá" value={stats.approvedPayrolls} icon={<CheckCircle2 size={18}/>} tone="green" />
        <StatCard label="Nghỉ phép chờ duyệt" value={stats.pendingLeaves} icon={<CalendarDays size={18}/>} tone="purple" />
        <StatCard
          label="Tổng lương tháng"
          value={formatVnd(stats.currentMonthPayrollTotal)}
          hint={`Tháng ${stats.currentMonth}`}
          icon={<Wallet size={18}/>}
          tone="red"
        />
      </div>

      <AttendanceKpiPanel
        kpi={stats.attendanceKpi}
        subtitle={`Tổng lượt vi phạm chuyên cần toàn công ty · tháng ${stats.currentMonth}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <a
          href="/luong"
          className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-gray-900">Quản lý bảng lương</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Duyệt, khoá, trả lương tháng</div>
            </div>
            <div className="text-blue-600 group-hover:translate-x-1 transition">→</div>
          </div>
          {stats.pendingPayrolls > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[11px] font-semibold">
              <Clock size={12}/> {stats.pendingPayrolls} bảng lương đang chờ duyệt
            </div>
          )}
        </a>

        <a
          href="/nghiphep"
          className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-gray-900">Quản lý nghỉ phép</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Duyệt đơn xin nghỉ</div>
            </div>
            <div className="text-blue-600 group-hover:translate-x-1 transition">→</div>
          </div>
          {stats.pendingLeaves > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded-md text-[11px] font-semibold">
              <CalendarDays size={12}/> {stats.pendingLeaves} đơn đang chờ
            </div>
          )}
        </a>
      </div>
    </div>
  )
}
