'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { useAuth } from '@/components/auth/AuthProvider'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

async function apiChangePassword(oldPassword: string, newPassword: string) {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Đổi mật khẩu thất bại')
  }
  return res.json()
}

export default function DoiMatKhauPage() {
  const { user } = useAuth()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!oldPw || !newPw || !confirmPw) {
      setError('Vui lòng nhập đầy đủ thông tin')
      return
    }
    if (newPw.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }
    if (newPw !== confirmPw) {
      setError('Mật khẩu mới không khớp')
      return
    }
    if (newPw === oldPw) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại')
      return
    }

    setLoading(true)
    try {
      await apiChangePassword(oldPw, newPw)
      setSuccess(true)
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e: any) {
      setError(e.message ?? 'Đổi mật khẩu thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell breadcrumb="Hệ thống" title="Đổi mật khẩu">
      <div className="max-w-md">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Lock size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Đổi mật khẩu</h3>
              <p className="text-[11px] text-gray-400">Tài khoản: {user?.email}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Old password */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Mật khẩu hiện tại</label>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPw} onChange={e => setOldPw(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 pr-9"
                  placeholder="Nhập mật khẩu hiện tại"
                />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showOld ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Mật khẩu mới <span className="text-gray-400 font-normal">(tối thiểu 6 ký tự)</span></label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPw} onChange={e => setNewPw(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 pr-9"
                  placeholder="Nhập mật khẩu mới"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Nhập lại mật khẩu mới</label>
              <input
                type="password"
                value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="Xác nhận mật khẩu mới"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                <AlertCircle size={13}/> {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-600">
                <CheckCircle size={13}/> Đổi mật khẩu thành công!
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {loading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
            </button>
          </form>
        </div>
      </div>
    </PageShell>
  )
}
