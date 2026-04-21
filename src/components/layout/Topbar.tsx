'use client'
import { Bell, Menu } from 'lucide-react'
import { useSidebar } from './SidebarContext'

interface TopbarProps {
  breadcrumb?: string
  title: string
}

export default function Topbar({ breadcrumb = 'Tổng quan', title }: TopbarProps) {
  const { openMobile } = useSidebar()

  return (
    <div className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-3 md:px-7 flex items-center justify-between shrink-0 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={openMobile}
          className="md:hidden shrink-0 w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          aria-label="Mở menu"
        >
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-gray-400 hidden sm:inline">{breadcrumb}</span>
          <span className="text-gray-300 hidden sm:inline">/</span>
          <span className="font-bold text-gray-900 truncate">{title}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <span className="hidden md:inline bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600">
          Tháng 4 / 2026
        </span>
        <span className="hidden sm:flex bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-green-600 items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
        <button className="w-9 h-9 md:w-[34px] md:h-[34px] bg-white border border-gray-200 rounded-lg flex items-center justify-center relative hover:bg-gray-50">
          <Bell size={15} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500 border-2 border-white" />
        </button>
        <div className="w-9 h-9 md:w-[34px] md:h-[34px] rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white cursor-pointer">
          HL
        </div>
      </div>
    </div>
  )
}
