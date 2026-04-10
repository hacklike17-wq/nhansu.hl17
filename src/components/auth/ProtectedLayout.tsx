'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import Sidebar from '@/components/layout/Sidebar'
import { ROUTE_PERMISSION, hasPermission } from '@/constants/data'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && !user && pathname !== '/login') {
      router.replace('/login')
    }
  }, [user, isLoading, pathname, router])

  // Check route permission
  useEffect(() => {
    if (!isLoading && user && pathname !== '/login') {
      const requiredPerm = ROUTE_PERMISSION[pathname]
      if (requiredPerm && !hasPermission(user.permissions, requiredPerm)) {
        router.replace('/')
      }
    }
  }, [user, isLoading, pathname, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Đang tải...</span>
        </div>
      </div>
    )
  }

  if (pathname === '/login') {
    return <>{children}</>
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
