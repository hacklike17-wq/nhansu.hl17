'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { useAuth } from '@/components/auth/AuthProvider'
import { useEmployees } from '@/hooks/useEmployees'
import { useDeductions, createDeduction, approveDeduction } from '@/hooks/useDeductions'

const TYPE_MAP = {
  NGHI_NGAY: { label: 'Nghỉ ngày',    delta: -1.0,  cls: 'bg-red-50 text-red-700 border-red-200' },
  DI_MUON:   { label: 'Đi muộn',      delta: -0.25, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  VE_SOM:    { label: 'Về sớm',       delta: -0.25, cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  OVERTIME:  { label: 'Tăng ca (OT)', delta: +0.25, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
} as const

type DedType = keyof typeof TYPE_MAP

const STATUS_MAP = {
  PENDING:  { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Đã duyệt',  cls: 'bg-green-50 text-green-700 border-green-200' },
  REJECTED: { label: 'Từ chối',   cls: 'bg-red-50 text-red-700 border-red-200' },
}

const DEFAULT_MONTH = new Date().toISOString().slice(0, 7)

type FormState = {
  type: DedType
  date: string
  reason: string
  selectedEmpId: string
}

function toDateStr(val: string | Date): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val).slice(0, 10)
}

export default function NghiPhepPage() {
  const { user } = useAuth()
  const isManager = user?.role !== 'employee'

  const [selectedMonth, setSelectedMonth] = useState<string>(DEFAULT_MONTH)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { employees } = useEmployees()
  const { deductions, mutate } = useDeductions({
    month: selectedMonth,
    employeeId: isManager ? undefined : user?.employeeId ?? undefined,
  })

  const [form, setForm] = useState<FormState>({
    type: 'NGHI_NGAY',
    date: '',
    reason: '',
    selectedEmpId: '',
  })

  // ── Summary stats ──
  const approvedDeds = deductions.filter((d: any) => d.status === 'APPROVED')
  const netDeduction = approvedDeds.reduce((s: number, d: any) => s + Number(d.delta), 0)
  const otSum = approvedDeds.filter((d: any) => d.type === 'OVERTIME').reduce((s: number, d: any) => s + Number(d.delta), 0)
  const pendingCount = deductions.filter((d: any) => d.status === 'PENDING').length

  // ── Handlers ──
  async function handleApprove(id: string) {
    try {
      await approveDeduction(id, 'APPROVED')
      await mutate()
    } catch (e) {
      console.error('approveDeduction error:', e)
    }
  }

  async function handleReject(id: string) {
    try {
      await approveDeduction(id, 'REJECTED')
      await mutate()
    } catch (e) {
      console.error('approveDeduction error:', e)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.reason.trim()) return

    const empId = isManager ? form.selectedEmpId : user!.employeeId
    if (!empId) return

    setSubmitting(true)
    try {
      await createDeduction({
        employeeId: empId,
        date: form.date,
        type: form.type,
        delta: TYPE_MAP[form.type].delta,
        reason: form.reason,
      })
      await mutate()
      setForm({ type: 'NGHI_NGAY', date: '', reason: '', selectedEmpId: employees[0]?.id ?? '' })
      setShowForm(false)
    } catch (e) {
      console.error('createDeduction error:', e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell breadcrumb="Nhân sự" title="Công số trừ">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-[13px] text-gray-600 font-medium">Tháng:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-[13px] border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? 'Hủy' : '+ Gửi yêu cầu'}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Công số trừ tháng</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            -{Math.abs(Math.min(0, netDeduction)).toFixed(2)}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Chỉ tính đã duyệt</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Tăng ca (OT)</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            +{otSum.toFixed(2)}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Chỉ tính đã duyệt</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Đang chờ duyệt</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Yêu cầu trong tháng</div>
        </div>
      </div>

      {/* ── Add form ── */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-[14px] font-semibold text-gray-800 mb-4">Tạo yêu cầu mới</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            {/* Loại */}
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-gray-600">Loại</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as DedType }))}
                className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {(Object.keys(TYPE_MAP) as DedType[]).map(k => (
                  <option key={k} value={k}>{TYPE_MAP[k].label} ({TYPE_MAP[k].delta > 0 ? '+' : ''}{TYPE_MAP[k].delta})</option>
                ))}
              </select>
            </div>

            {/* Ngày */}
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-gray-600">Ngày</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Manager: chọn nhân viên */}
            {isManager && (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-medium text-gray-600">Nhân viên</label>
                <select
                  value={form.selectedEmpId}
                  onChange={e => setForm(f => ({ ...f, selectedEmpId: e.target.value }))}
                  className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName} — {emp.department}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Lý do */}
            <div className={`flex flex-col gap-1 ${isManager ? '' : 'col-span-2'}`}>
              <label className="text-[12px] font-medium text-gray-600">Lý do</label>
              <textarea
                required
                rows={2}
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Nhập lý do..."
                className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Delta preview */}
            <div className="col-span-2 flex items-center gap-3">
              <span className="text-[12px] text-gray-500">
                Công số tự động:{' '}
                <span className={`font-bold ${TYPE_MAP[form.type].delta > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {TYPE_MAP[form.type].delta > 0 ? '+' : ''}{TYPE_MAP[form.type].delta}
                </span>
              </span>
              {!isManager && (
                <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  Yêu cầu sẽ ở trạng thái chờ duyệt
                </span>
              )}
              {isManager && (
                <span className="text-[11px] text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                  Admin: tự động duyệt
                </span>
              )}
              <div className="ml-auto">
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-[13px] font-semibold text-gray-700">
            Danh sách — {selectedMonth} ({deductions.length} bản ghi)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[12px]">Ngày</th>
                {isManager && (
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[12px]">Nhân viên</th>
                )}
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[12px]">Loại</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500 text-[12px]">Công số</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[12px]">Lý do</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500 text-[12px]">Trạng thái</th>
                {isManager && (
                  <th className="text-center px-4 py-2.5 font-semibold text-gray-500 text-[12px]">Thao tác</th>
                )}
              </tr>
            </thead>
            <tbody>
              {deductions.length === 0 ? (
                <tr>
                  <td
                    colSpan={isManager ? 7 : 5}
                    className="px-4 py-8 text-center text-[13px] text-gray-400"
                  >
                    Chưa có bản ghi nào trong tháng {selectedMonth}
                  </td>
                </tr>
              ) : (
                deductions
                  .slice()
                  .sort((a: any, b: any) => toDateStr(b.date).localeCompare(toDateStr(a.date)))
                  .map((d: any) => {
                    const typeInfo   = TYPE_MAP[d.type as DedType] ?? { label: d.type, delta: Number(d.delta), cls: 'bg-gray-50 text-gray-700 border-gray-200' }
                    const statusInfo = STATUS_MAP[d.status as keyof typeof STATUS_MAP] ?? { label: d.status, cls: 'bg-gray-50 text-gray-600 border-gray-200' }
                    const delta      = Number(d.delta)
                    const deltaPos   = delta > 0
                    return (
                      <tr key={d.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{toDateStr(d.date)}</td>
                        {isManager && (
                          <td className="px-4 py-2.5 font-medium text-gray-900">{d.employee?.fullName ?? '—'}</td>
                        )}
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${typeInfo.cls}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold">
                          <span className={deltaPos ? 'text-blue-600' : 'text-red-600'}>
                            {deltaPos ? '+' : ''}{delta.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">{d.reason}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${statusInfo.cls}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        {isManager && (
                          <td className="px-4 py-2.5 text-center">
                            {d.status === 'PENDING' ? (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleApprove(d.id)}
                                  className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  Duyệt
                                </button>
                                <button
                                  onClick={() => handleReject(d.id)}
                                  className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  Từ chối
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
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
    </PageShell>
  )
}
