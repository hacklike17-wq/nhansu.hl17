'use client'
/**
 * SalaryEntriesModal — line-item breakdown for a single salary column.
 *
 * Used from two places:
 *  - /luong (manager table) → click a cell for tien_phu_cap / tien_tru_khac
 *  - PersonalSalaryView (employee) → click the "Phụ cấp" / "Trừ khác" row
 *
 * The modal fetches GET /api/payroll/salary-values/entries?payrollId=X and
 * filters locally to the requested columnKey. Total below the list mirrors
 * SalaryValue.value after the backend sum-sync, so the payroll calc stays
 * 100% untouched.
 *
 * `canEdit=false` renders a read-only list (employee view).
 */
import { useEffect, useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { fmtVND } from '@/lib/format'

type Entry = {
  id: string
  amount: number
  reason: string
  occurredAt: string | null
  createdBy: string | null
  createdAt: string
}

type Breakdown = {
  columnKey: string
  total: number
  entries: Entry[]
}

type Props = {
  payrollId: string
  columnKey: 'tien_phu_cap' | 'tien_tru_khac'
  columnLabel: string
  canEdit: boolean
  onClose: () => void
  onChanged?: () => void | Promise<void>  // refresh parent payroll list after add/delete
}

export default function SalaryEntriesModal({
  payrollId,
  columnKey,
  columnLabel,
  canEdit,
  onClose,
  onChanged,
}: Props) {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add-entry form state
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/payroll/salary-values/entries?payrollId=${payrollId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Không tải được dữ liệu')
        return
      }
      const match: Breakdown | undefined = (data.breakdowns ?? []).find(
        (b: Breakdown) => b.columnKey === columnKey
      )
      setBreakdown(
        match ?? { columnKey, total: 0, entries: [] }
      )
    } catch (e) {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payrollId, columnKey])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const num = parseInt(amount.replace(/\D/g, ''), 10)
    if (!num || num <= 0) {
      setFormError('Số tiền không hợp lệ')
      return
    }
    if (!reason.trim()) {
      setFormError('Vui lòng nhập lý do')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/payroll/salary-values/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollId,
          columnKey,
          amount: num,
          reason: reason.trim(),
          occurredAt: occurredAt || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg =
          typeof data?.error === 'string'
            ? data.error
            : data?.error?.formErrors?.[0] ?? 'Không thể lưu'
        setFormError(msg)
        return
      }
      // Refresh local + parent
      setAmount('')
      setReason('')
      setOccurredAt('')
      const match: Breakdown | undefined = (data.breakdowns ?? []).find(
        (b: Breakdown) => b.columnKey === columnKey
      )
      if (match) setBreakdown(match)
      await onChanged?.()
    } catch (e) {
      setFormError('Lỗi kết nối')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xoá mục này?')) return
    try {
      const res = await fetch(`/api/payroll/salary-values/entries/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(typeof data?.error === 'string' ? data.error : 'Không thể xoá')
        return
      }
      await load()
      await onChanged?.()
    } catch {
      alert('Lỗi kết nối')
    }
  }

  const entries = breakdown?.entries ?? []
  const total = breakdown?.total ?? 0
  const isDeduction = columnKey === 'tien_tru_khac'
  const accent = isDeduction ? 'text-red-600' : 'text-gray-900'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 md:p-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{columnLabel}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {canEdit ? 'Chi tiết từng khoản — tổng cộng sẽ tự đồng bộ' : 'Chi tiết từng khoản'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-5 py-10 text-center text-xs text-gray-400">Đang tải...</div>
          ) : error ? (
            <div className="px-5 py-10 text-center text-xs text-red-500">{error}</div>
          ) : entries.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-gray-400">
              Chưa có khoản nào. {canEdit && 'Thêm bên dưới.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {entries.map(e => (
                <li key={e.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 break-words">{e.reason}</div>
                    {e.occurredAt && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Ngày: {e.occurredAt}
                      </div>
                    )}
                  </div>
                  <div className={`text-xs font-semibold tabular-nums ${accent}`}>
                    {isDeduction ? '−' : ''}{fmtVND(e.amount)} ₫
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Xoá"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Total */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/60">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            Tổng {isDeduction ? 'trừ' : 'cộng'}
          </span>
          <span className={`text-sm font-bold tabular-nums ${accent}`}>
            {isDeduction ? '−' : ''}{fmtVND(total)} ₫
          </span>
        </div>

        {/* Add form */}
        {canEdit && (
          <form
            onSubmit={handleAdd}
            className="px-5 py-4 border-t border-gray-100 space-y-2 bg-white"
          >
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Số tiền"
                disabled={saving}
                className="w-32 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:opacity-50"
              />
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Lý do (vd: phụ cấp ăn, đi muộn...)"
                disabled={saving}
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:opacity-50"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={occurredAt}
                onChange={e => setOccurredAt(e.target.value)}
                disabled={saving}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={saving}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                <Plus size={12} /> {saving ? 'Đang lưu...' : 'Thêm khoản'}
              </button>
            </div>
            {formError && (
              <div className="text-[11px] text-red-500">{formError}</div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
