'use client'
import { useMemo, useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { useAuth } from '@/components/auth/AuthProvider'
import { useEmployees } from '@/hooks/useEmployees'
import {
  useLeaveRequests,
  createLeaveRequest,
  approveLeaveRequest,
} from '@/hooks/useLeaveRequests'
import { Plus, Check, X, Clock, CheckCircle2, XCircle, FileText } from 'lucide-react'

/**
 * /khong-luong — Nghỉ không lương (Unpaid leave)
 *
 * Reuses LeaveRequest model with type='UNPAID'. Approval flow triggers the
 * existing DeductionEvent creation (-1 per workday) AND now also writes a
 * KpiViolation row with type='KL' per day (see /api/leave-requests/[id]/approve).
 */

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:   { label: 'Chờ duyệt',  cls: 'bg-amber-50 text-amber-700 border-amber-200',   icon: <Clock size={12}/> },
  APPROVED:  { label: 'Đã duyệt',   cls: 'bg-green-50 text-green-700 border-green-200',   icon: <CheckCircle2 size={12}/> },
  REJECTED:  { label: 'Từ chối',    cls: 'bg-red-50 text-red-700 border-red-200',         icon: <XCircle size={12}/> },
  CANCELLED: { label: 'Đã huỷ',     cls: 'bg-gray-100 text-gray-600 border-gray-200',     icon: <X size={12}/> },
}

function fmtDate(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysBetweenInclusive(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  const diff = Math.floor((e.getTime() - s.getTime()) / (24 * 3600 * 1000)) + 1
  return Math.max(1, diff)
}

export default function KhongLuongPage() {
  const { user, hasPermission } = useAuth()
  const isManager = user?.role !== 'employee'
  const canApprove = isManager && hasPermission('nghiphep.edit')

  const { employees } = useEmployees()
  const { leaveRequests, mutate, isLoading } = useLeaveRequests()

  // Filter to UNPAID only — this page is dedicated to "Nghỉ không lương"
  const unpaidRequests = useMemo(
    () => (leaveRequests ?? []).filter((r: any) => r.type === 'UNPAID'),
    [leaveRequests]
  )

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [formEmpId, setFormEmpId] = useState<string>('')
  const [formStart, setFormStart] = useState<string>(new Date().toISOString().slice(0, 10))
  const [formEnd, setFormEnd] = useState<string>(new Date().toISOString().slice(0, 10))
  const [formReason, setFormReason] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  function openCreate() {
    setFormEmpId(user?.employeeId ?? '')
    setFormStart(new Date().toISOString().slice(0, 10))
    setFormEnd(new Date().toISOString().slice(0, 10))
    setFormReason('')
    setCreateOpen(true)
  }

  async function handleCreate() {
    const targetEmp = formEmpId || user?.employeeId
    if (!targetEmp) {
      setFeedback('Thiếu nhân viên')
      return
    }
    if (!formStart || !formEnd) {
      setFeedback('Thiếu ngày bắt đầu / kết thúc')
      return
    }
    if (formEnd < formStart) {
      setFeedback('Ngày kết thúc phải sau ngày bắt đầu')
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      await createLeaveRequest({
        employeeId: targetEmp,
        type: 'UNPAID',
        startDate: formStart,
        endDate: formEnd,
        totalDays: daysBetweenInclusive(formStart, formEnd),
        reason: formReason.trim() || undefined,
      })
      await mutate()
      setCreateOpen(false)
      setFeedback('Đã tạo đơn nghỉ không lương')
    } catch (e: any) {
      setFeedback(`Lỗi: ${e.message ?? 'Không thể tạo đơn'}`)
    } finally {
      setSubmitting(false)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  async function handleApprove(id: string, action: 'APPROVED' | 'REJECTED' | 'CANCELLED') {
    try {
      await approveLeaveRequest(id, action)
      await mutate()
    } catch (e: any) {
      alert(`Lỗi: ${e.message ?? 'Không thể xử lý'}`)
    }
  }

  const pendingCount = unpaidRequests.filter((r: any) => r.status === 'PENDING').length
  const approvedCount = unpaidRequests.filter((r: any) => r.status === 'APPROVED').length

  return (
    <PageShell breadcrumb="Nhân sự" title="Nghỉ không lương">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[11px] text-gray-500">
            Quản lý đơn xin nghỉ không lương. Khi được duyệt, hệ thống tự động cập nhật KPI chuyên cần mã <b>KL</b> cho nhân viên.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
        >
          <Plus size={13}/> Tạo đơn
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Tổng đơn</div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">{unpaidRequests.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Chờ duyệt</div>
          <div className="text-xl font-bold text-amber-600 mt-0.5">{pendingCount}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500">Đã duyệt</div>
          <div className="text-xl font-bold text-green-600 mt-0.5">{approvedCount}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <FileText size={14} className="text-gray-400"/>
          <h3 className="text-sm font-bold text-gray-900">Danh sách đơn nghỉ không lương</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Nhân viên</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Từ ngày</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Đến ngày</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Số ngày</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Lý do</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
                {canApprove && <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Hành động</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={canApprove ? 7 : 6} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
              ) : unpaidRequests.length === 0 ? (
                <tr><td colSpan={canApprove ? 7 : 6} className="px-4 py-8 text-center text-gray-400">Chưa có đơn nghỉ không lương</td></tr>
              ) : (
                unpaidRequests.map((r: any) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.PENDING
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-gray-900">{r.employee?.fullName ?? '—'}</div>
                        <div className="text-[10px] text-gray-400">{r.employee?.department ?? '—'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{fmtDate(r.startDate)}</td>
                      <td className="px-4 py-2.5 text-gray-700">{fmtDate(r.endDate)}</td>
                      <td className="px-4 py-2.5 text-center font-semibold">{r.totalDays}</td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${meta.cls}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      {canApprove && (
                        <td className="px-4 py-2.5 text-right">
                          {r.status === 'PENDING' && (
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleApprove(r.id, 'APPROVED')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-green-200 bg-green-50 text-green-700 text-[11px] font-semibold hover:bg-green-100"
                                title="Duyệt"
                              >
                                <Check size={11}/> Duyệt
                              </button>
                              <button
                                onClick={() => handleApprove(r.id, 'REJECTED')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100"
                                title="Từ chối"
                              >
                                <X size={11}/> Từ chối
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-2 text-xs z-50">
          {feedback}
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !submitting && setCreateOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Tạo đơn nghỉ không lương</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Khi được duyệt, KPI chuyên cần mã KL sẽ được ghi nhận</p>
              </div>
              <button onClick={() => !submitting && setCreateOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-3">
              {isManager && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Nhân viên</label>
                  <select
                    value={formEmpId}
                    onChange={e => setFormEmpId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                  >
                    <option value="">— Chọn nhân viên —</option>
                    {employees.map((e: any) => (
                      <option key={e.id} value={e.id}>{e.fullName} · {e.department}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Từ ngày</label>
                  <input type="date" value={formStart} onChange={e => setFormStart(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Đến ngày</label>
                  <input type="date" value={formEnd} onChange={e => setFormEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"/>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Lý do</label>
                <textarea rows={3} value={formReason} onChange={e => setFormReason(e.target.value)}
                  placeholder="Lý do xin nghỉ..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs resize-none"/>
              </div>
              <div className="text-[11px] text-gray-500">
                Tổng số ngày: <b>{daysBetweenInclusive(formStart, formEnd)}</b>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setCreateOpen(false)} disabled={submitting}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleCreate} disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-60">
                {submitting ? 'Đang tạo...' : 'Tạo đơn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
