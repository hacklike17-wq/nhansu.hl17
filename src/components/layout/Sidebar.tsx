'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_SECTIONS, ROUTE_PERMISSION, hasPermission } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { useSidebar } from '@/components/layout/SidebarContext'
import { signOut } from 'next-auth/react'
import {
  LayoutGrid, BarChart2, Users, Calendar, Clock, ArrowRight,
  TrendingUp, DollarSign, ArrowLeftRight, Lock, FileText,
  Settings, ChevronDown, LogOut, X,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ReactNode> = {
  grid:      <LayoutGrid size={15} />,
  chart:     <BarChart2 size={15} />,
  users:     <Users size={15} />,
  calendar:  <Calendar size={15} />,
  clock:     <Clock size={15} />,
  clock2:    <Clock size={15} />,
  arrow:     <ArrowRight size={15} />,
  trending:  <TrendingUp size={15} />,
  dollar:    <DollarSign size={15} />,
  flow:      <ArrowLeftRight size={15} />,
  lock:      <Lock size={15} />,
  file:      <FileText size={15} />,
  settings:  <Settings size={15} />,
  cog:       <Settings size={15} />,
}

const BADGE_STYLE: Record<string, string> = {
  red:   'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  blue:  'bg-blue-50 text-blue-600',
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản trị viên',
  manager: 'Quản lý',
  employee: 'Nhân viên',
}

export default function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { mobileOpen, closeMobile } = useSidebar()

  const initials = user?.name
    ? user.name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase()
    : 'HL'

  return (
    <aside
      className={cn(
        // Base: 260px on mobile (comfortable for touch), 220px on desktop
        'w-[260px] md:w-[220px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen',
        // Mobile: fixed overlay that slides in from the left
        'fixed top-0 left-0 z-50 transform transition-transform duration-200 ease-out',
        // Desktop: static column in the flex parent
        'md:sticky md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* Brand */}
      <div className="px-5 py-[18px] border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[10px] bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-black tracking-tighter leading-none">HL<br/>17</span>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">nhansu.hl17</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Quản trị doanh nghiệp</div>
          </div>
        </div>
        {/* Close button — only visible on mobile when the drawer is open */}
        <button
          onClick={closeMobile}
          className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Đóng menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Workspace */}
      <div className="mx-3.5 my-3 bg-gray-50 border border-gray-200 rounded-[10px] px-3 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-gray-100 transition-colors">
        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <LayoutGrid size={12} className="text-blue-600" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900">Workspace</div>
          <div className="text-[10px] text-gray-400">04 · 2026</div>
        </div>
        <ChevronDown size={12} className="ml-auto text-gray-400" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-2 overflow-y-auto">
        {NAV_SECTIONS.map((section) => {
          const perms = user?.permissions || []
          const visibleItems = section.items.filter(item => {
            const requiredPerm = ROUTE_PERMISSION[item.href]
            if (!requiredPerm) return true
            return hasPermission(perms, requiredPerm)
          })
          if (visibleItems.length === 0) return null
          return (
          <div key={section.label} className="mb-1">
            <div className="px-2.5 pt-2.5 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {section.label}
            </div>
            {visibleItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2.5 md:py-2 rounded-lg text-[13px] font-medium transition-all relative',
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-semibold before:absolute before:left-0 before:top-[25%] before:bottom-[25%] before:w-[3px] before:bg-blue-600 before:rounded-r-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <span className="shrink-0">{ICON_MAP[item.icon]}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', BADGE_STYLE[item.badge.variant])}>
                      {item.badge.text}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-900 truncate">{user?.name || 'Admin'}</div>
          <div className="text-[10px] text-gray-400">{ROLE_LABEL[user?.role || 'employee']}</div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Đăng xuất"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
