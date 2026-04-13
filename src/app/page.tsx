import Topbar from "@/components/layout/Topbar"
import { auth } from "@/auth"
import { normalizeRole, hasPermission } from "@/constants/data"
import { getDashboardData } from "./_lib/dashboard-queries"
import AdminDashboard from "@/components/dashboard/AdminDashboard"
import ManagerDashboard from "@/components/dashboard/ManagerDashboard"
import EmployeeDashboard from "@/components/dashboard/EmployeeDashboard"
import { ShieldAlert } from "lucide-react"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const u = session.user as any
  const role = normalizeRole(u.role)
  const permissions: string[] = u.permissions ?? []

  // Strict permission gate — if user doesn't have dashboard.view, show empty state (no data fetched)
  if (!hasPermission(permissions, "dashboard.view")) {
    return (
      <>
        <Topbar title="Dashboard" />
        <main className="flex-1 overflow-y-auto p-7">
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-md mx-auto mt-20">
            <ShieldAlert size={40} className="mx-auto text-amber-500 mb-3" />
            <div className="text-sm font-bold text-gray-900">Không có quyền truy cập</div>
            <div className="text-xs text-gray-500 mt-1">
              Tài khoản của bạn không có quyền xem dashboard. Liên hệ quản trị viên để được cấp quyền.
            </div>
          </div>
        </main>
      </>
    )
  }

  const { data } = await getDashboardData(role, u.companyId, u.employeeId)
  const userName = u.name ?? u.email ?? "bạn"

  return (
    <>
      <Topbar title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-7">
        {!data ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-500">
            Chưa có dữ liệu để hiển thị.
          </div>
        ) : role === "admin" ? (
          <AdminDashboard stats={data as any} userName={userName} />
        ) : role === "manager" ? (
          <ManagerDashboard stats={data as any} userName={userName} />
        ) : (
          <EmployeeDashboard stats={data as any} userName={userName} />
        )}
      </main>
    </>
  )
}
