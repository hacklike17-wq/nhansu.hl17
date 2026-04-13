'use client'
import { useAuth } from './AuthProvider'
import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  /** e.g. "nhanvien.view", "luong.edit". Supports wildcards like "luong.*". */
  perm: string
  /** Optional fallback UI; default shows an "Access denied" card. */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Client-side permission gate. Wrap a page body to hide it from users who
 * lack the required permission. This is UX — NOT a security boundary.
 * API endpoints must enforce permissions server-side via requirePermission().
 */
export default function RequirePermission({ perm, fallback, children }: Props) {
  const { user, hasPermission, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-xs text-gray-400">Đang kiểm tra quyền...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-xs text-gray-400">Chưa đăng nhập</div>
      </div>
    )
  }

  if (!hasPermission(perm)) {
    if (fallback) return <>{fallback}</>
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-md">
          <ShieldAlert size={40} className="mx-auto text-amber-500 mb-3" />
          <div className="text-sm font-bold text-gray-900">Không có quyền truy cập</div>
          <div className="text-xs text-gray-500 mt-1">
            Tài khoản của bạn không có quyền <span className="font-mono font-semibold">{perm}</span>.
            Liên hệ quản trị viên để được cấp quyền.
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
