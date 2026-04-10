import Topbar from '@/components/layout/Topbar'
import KpiCard from '@/components/dashboard/KpiCard'
import CashflowList from '@/components/dashboard/CashflowList'
import EmployeeTable from '@/components/dashboard/EmployeeTable'
import BudgetPanel from '@/components/dashboard/BudgetPanel'
import RevenueChart from '@/components/charts/RevenueChart'
import DonutChart from '@/components/charts/DonutChart'
import { KPI_DATA } from '@/constants/data'

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" />

      <main className="flex-1 overflow-y-auto p-7 space-y-4">

        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-3.5">
          {KPI_DATA.map((kpi) => (
            <KpiCard key={kpi.label} data={kpi} />
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 bg-gray-100 border border-gray-200 rounded-[10px] p-1 w-fit">
          {['Tổng quan', 'Nhân sự', 'Doanh thu & Chi phí', 'Dòng tiền', 'Công nợ'].map((tab, i) => (
            <button
              key={tab}
              className={`px-4 py-1.5 rounded-lg text-[12.5px] font-medium transition-all ${
                i === 0
                  ? 'bg-white text-gray-900 font-semibold border border-gray-200 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Row 1: Chart + Cashflow */}
        <div className="grid grid-cols-[1.7fr_1fr] gap-3.5">
          {/* Revenue Chart */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4.5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold text-gray-900">Doanh thu &amp; Chi phí — 6 tháng</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Đơn vị: triệu đồng</div>
              </div>
              <div className="flex items-center gap-2">
                <select className="text-[11px] px-2 py-1 border border-gray-200 rounded-md text-gray-500 bg-gray-50">
                  <option>6 tháng</option>
                  <option>12 tháng</option>
                </select>
                <button className="text-xs text-blue-600 font-medium hover:underline">Chi tiết →</button>
              </div>
            </div>
            <div className="p-4">
              <div className="flex gap-3.5 mb-2.5 flex-wrap">
                {[
                  { label: 'Doanh thu', color: '#2563EB' },
                  { label: 'Chi phí',   color: '#F59E0B' },
                  { label: 'Lợi nhuận trước thuế', color: '#16A34A', rounded: true },
                ].map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                    <span
                      className="w-2.5 h-2.5 inline-block"
                      style={{ background: l.color, borderRadius: l.rounded ? '50%' : 2 }}
                    />
                    {l.label}
                  </span>
                ))}
              </div>
              <RevenueChart />
            </div>
          </div>

          {/* Cashflow */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4.5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold text-gray-900">Dòng tiền gần đây</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Cập nhật thời gian thực</div>
              </div>
              <button className="text-xs text-blue-600 font-medium hover:underline">Xem tất cả →</button>
            </div>
            <div className="px-4.5 py-3">
              <CashflowList />
            </div>
          </div>
        </div>

        {/* Row 2: Employee + Budget + Donut */}
        <div className="grid grid-cols-3 gap-3.5">
          {/* Employee Table (span 2) */}
          <div className="col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4.5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold text-gray-900">Nhân viên — trạng thái hôm nay</div>
                <div className="text-[11px] text-gray-400 mt-0.5">09/04/2026 · 248 nhân viên</div>
              </div>
              <button className="text-xs text-blue-600 font-medium hover:underline">Quản lý →</button>
            </div>
            <div className="p-4">
              <EmployeeTable />
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-3.5">
            {/* Budget */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4.5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-bold text-gray-900">Ngân sách theo hạng mục</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Tháng 4/2026</div>
                </div>
                <button className="text-xs text-blue-600 font-medium hover:underline">Sửa →</button>
              </div>
              <div className="p-4">
                <BudgetPanel />
              </div>
            </div>

            {/* Donut */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4.5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div className="text-[13px] font-bold text-gray-900">Cơ cấu chi phí</div>
                <button className="text-xs text-blue-600 font-medium hover:underline">Chi tiết →</button>
              </div>
              <div className="p-4">
                <DonutChart />
              </div>
            </div>
          </div>
        </div>

      </main>
    </>
  )
}
