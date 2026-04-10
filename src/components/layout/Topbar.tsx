'use client'
import { Bell } from 'lucide-react'

interface TopbarProps {
  breadcrumb?: string
  title: string
}

export default function Topbar({ breadcrumb = 'Tổng quan', title }: TopbarProps) {
  return (
    <div className="h-14 bg-white border-b border-gray-200 px-7 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-400">{breadcrumb}</span>
        <span className="text-gray-300">/</span>
        <span className="font-bold text-gray-900">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600">
          Tháng 4 / 2026
        </span>
        <span className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-green-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
        <button className="w-[34px] h-[34px] bg-white border border-gray-200 rounded-lg flex items-center justify-center relative hover:bg-gray-50">
          <Bell size={15} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500 border-2 border-white" />
        </button>
        <div className="w-[34px] h-[34px] rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white cursor-pointer">
          HL
        </div>
      </div>
    </div>
  )
}
