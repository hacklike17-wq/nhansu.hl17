'use client'
import { useMemo, useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, CheckCircle2, Clock, Lock, Banknote, ThumbsUp, ThumbsDown, AlertTriangle, FileText, X } from 'lucide-react'
import { fmtVND } from '@/lib/format'
import { STATUS_MAP } from '@/app/luong/_lib/constants'
import { buildRowVars } from '@/app/luong/_lib/row-helpers'
import { useSalaryColumns } from '@/hooks/useSalaryColumns'
import ApprovalHistory from './ApprovalHistory'
import SalaryEntriesModal from './SalaryEntriesModal'

type PayrollRow = {
  id: string
  status: string
  month: string
  employee?: { fullName?: string; department?: string; position?: string }
  baseSalary: number | string
  responsibilitySalary: number | string
  workSalary: number | string
  netWorkUnits: number | string
  overtimeHours: number | string
  overtimePay: number | string
  tienPhuCap: number | string
  kpiChuyenCan: number | string
  mealPay: number | string
  grossSalary: number | string
  bhxhEmployee: number | string
  bhytEmployee: number | string
  bhtnEmployee: number | string
  pitTax: number | string
  tienPhat: number | string
  netSalary: number | string
  needsRecalc?: boolean
  note?: string | null
  salaryValues?: Array<{ columnKey: string; value: number | string }>
}

type Props = {
  payroll: PayrollRow | null
  month: string
  onMonthChange: (m: string) => void
  onConfirm?: (id: string) => Promise<void>
  onReject?: (id: string, note: string) => Promise<void>
  showBhCols?: boolean
  showPitCol?: boolean
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  const Icon =
    status === 'APPROVED' || status === 'LOCKED' || status === 'PAID'
      ? CheckCircle2
      : status === 'PENDING'
        ? Clock
        : status === 'LOCKED'
          ? Lock
          : FileText
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${meta.cls}`}>
      <Icon size={12}/> {meta.label}
    </span>
  )
}

function LineRow({
  label,
  value,
  tone = 'normal',
  onClick,
  alwaysShow = false,
  format = 'vnd',
}: {
  label: string
  value: number
  tone?: 'normal' | 'positive' | 'negative' | 'muted'
  onClick?: () => void
  alwaysShow?: boolean
  format?: 'vnd' | 'number'
}) {
  if (!alwaysShow && !value) return null
  const isZero = !value
  const effTone = isZero && alwaysShow ? 'muted' : tone
  const cls =
    effTone === 'negative'
      ? 'text-red-600'
      : effTone === 'muted'
        ? 'text-gray-400'
        : 'text-gray-900'
  const prefix = effTone === 'negative' && !isZero ? '− ' : ''
  const clickable = typeof onClick === 'function'
  const display =
    format === 'number'
      ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)
      : `${prefix}${fmtVND(value)} ₫`
  return (
    <div
      className={`flex items-center justify-between py-2 border-b border-gray-50 last:border-0 ${
        clickable ? 'cursor-pointer hover:bg-blue-50/40 rounded px-1 -mx-1 transition-colors' : ''
      }`}
      onClick={onClick}
      title={clickable ? 'Click để xem chi tiết' : undefined}
    >
      <span className={`text-xs ${effTone === 'muted' ? 'text-gray-400' : 'text-gray-600'}`}>
        {label}
        {clickable && <span className="ml-1 text-[10px] text-blue-500">›</span>}
      </span>
      <span className={`text-xs font-semibold tabular-nums ${cls}`}>{display}</span>
    </div>
  )
}


export default function PersonalSalaryView({
  payroll,
  month,
  onMonthChange,
  onConfirm,
  onReject,
  showBhCols = true,
  showPitCol = true,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [entriesModal, setEntriesModal] = useState<{
    columnKey: 'tien_phu_cap' | 'tien_tru_khac'
    label: string
  } | null>(null)

  const num = (v: number | string | undefined | null) => Number(v ?? 0)

  const { salaryColumns } = useSalaryColumns()
  const vars = useMemo(
    () => (payroll ? buildRowVars(payroll, salaryColumns) : {}),
    [payroll, salaryColumns]
  )

  const { addTotal, subTotal } = useMemo(() => {
    if (!payroll) return { addTotal: 0, subTotal: 0 }
    const addCols = salaryColumns.filter((c: any) => c.calcMode === 'add_to_net')
    const subCols = salaryColumns.filter((c: any) => c.calcMode === 'subtract_from_net')
    const hasCalcMode = addCols.length > 0 || subCols.length > 0
    if (hasCalcMode) {
      return {
        addTotal: addCols.reduce((s: number, c: any) => s + (vars[c.key] ?? 0), 0),
        subTotal: subCols.reduce((s: number, c: any) => s + (vars[c.key] ?? 0), 0),
      }
    }
    return {
      addTotal: num(payroll.grossSalary),
      subTotal: num(payroll.bhxhEmployee) + num(payroll.bhytEmployee) + num(payroll.bhtnEmployee) + num(payroll.pitTax),
    }
  }, [payroll, salaryColumns, vars])

  async function handleConfirm() {
    if (!payroll || !onConfirm) return
    if (!confirm('Bạn xác nhận số tiền trên bảng lương này là đúng? Sau khi xác nhận, bảng lương sẽ được khoá và không thể chỉnh sửa.')) return
    setSubmitting(true)
    setFeedback(null)
    try {
      await onConfirm(payroll.id)
      setFeedback('Đã xác nhận bảng lương')
    } catch (e: any) {
      setFeedback(`Lỗi: ${e.message ?? 'Không thể xác nhận'}`)
    } finally {
      setSubmitting(false)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  async function handleReject() {
    if (!payroll || !onReject) return
    if (!rejectNote.trim()) {
      setFeedback('Vui lòng nhập lý do từ chối')
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      await onReject(payroll.id, rejectNote.trim())
      setRejectOpen(false)
      setRejectNote('')
      setFeedback('Đã từ chối bảng lương. Admin sẽ chỉnh sửa và gửi lại.')
    } catch (e: any) {
      setFeedback(`Lỗi: ${e.message ?? 'Không thể từ chối'}`)
    } finally {
      setSubmitting(false)
      setTimeout(() => setFeedback(null), 5000)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header: month selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Bảng lương cá nhân</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {payroll?.employee?.fullName && `${payroll.employee.fullName} · `}
            {payroll?.employee?.department}
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={e => onMonthChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      </div>

      {!payroll ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <FileText size={36} className="mx-auto text-gray-300 mb-3"/>
          <div className="text-sm font-semibold text-gray-700">Chưa có bảng lương tháng {month}</div>
          <div className="text-xs text-gray-400 mt-1">Phòng nhân sự sẽ cập nhật khi kỳ lương được mở.</div>
        </div>
      ) : (
        <>
          {/* Hero: net salary */}
          <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 rounded-2xl p-6 md:p-7 text-white shadow-lg relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/5 rounded-full"/>
            <div className="absolute -right-12 -bottom-12 w-40 h-40 bg-white/5 rounded-full"/>
            <div className="relative flex items-start justify-between mb-4">
              <div>
                <div className="text-[11px] font-medium text-blue-100 uppercase tracking-wider">
                  Thực nhận tháng {month}
                </div>
                <div className="text-[10px] text-blue-200 mt-1">Net salary · đã trừ thuế & bảo hiểm</div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                <Wallet size={22}/>
              </div>
            </div>
            <div className="relative text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
              {fmtVND(num(payroll.netSalary))} <span className="text-2xl text-blue-200 font-semibold">₫</span>
            </div>
            <div className="relative flex items-center gap-2 mt-4 flex-wrap">
              <StatusBadge status={payroll.status}/>
              {payroll.needsRecalc && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-400/20 border border-amber-300/40">
                  <AlertTriangle size={11}/> Đang cập nhật
                </span>
              )}
            </div>
            {/* Actions — flow: admin sends, employee confirms/rejects */}
            {payroll.status === 'DRAFT' && (
              <div className="relative mt-5 pt-5 border-t border-white/10">
                <p className="text-[11px] text-blue-100">
                  {payroll.note
                    ? <>Admin đang chỉnh sửa bảng lương theo phản hồi. <span className="italic">"{payroll.note}"</span></>
                    : 'Bảng lương đang được chuẩn bị. Chờ admin gửi để xác nhận.'}
                </p>
              </div>
            )}
            {payroll.status === 'PENDING' && (onConfirm || onReject) && (
              <div className="relative mt-5 pt-5 border-t border-white/10">
                <p className="text-[11px] text-blue-100 mb-3">
                  Vui lòng kiểm tra kỹ các khoản bên dưới. Bạn cần xác nhận hoặc từ chối bảng lương này.
                </p>
                <div className="flex flex-wrap gap-2">
                  {onConfirm && (
                    <button
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-green-700 font-semibold text-xs rounded-lg hover:bg-green-50 transition disabled:opacity-60"
                    >
                      <ThumbsUp size={13}/> {submitting ? 'Đang xử lý...' : 'Xác nhận đúng'}
                    </button>
                  )}
                  {onReject && (
                    <button
                      onClick={() => setRejectOpen(true)}
                      disabled={submitting}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-500/20 text-white border border-red-300/40 font-semibold text-xs rounded-lg hover:bg-red-500/30 transition disabled:opacity-60"
                    >
                      <ThumbsDown size={13}/> Không đúng — từ chối
                    </button>
                  )}
                </div>
              </div>
            )}
            {payroll.status === 'LOCKED' && (
              <div className="relative mt-5 pt-5 border-t border-white/10">
                <p className="text-[11px] text-blue-100 inline-flex items-center gap-1.5">
                  <Lock size={12}/> Bạn đã xác nhận bảng lương này. Không thể chỉnh sửa.
                </p>
              </div>
            )}
            {payroll.status === 'PAID' && (
              <div className="relative mt-5 pt-5 border-t border-white/10">
                <p className="text-[11px] text-blue-100 inline-flex items-center gap-1.5">
                  <CheckCircle2 size={12}/> Đã thanh toán.
                </p>
              </div>
            )}
            {feedback && (
              <div className="relative mt-4 text-[11px] bg-white/10 rounded-md px-3 py-2 border border-white/20">
                {feedback}
              </div>
            )}
          </div>

          {/* Breakdown: Income + Deductions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Income */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                  <TrendingUp size={15}/>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">Thu nhập</div>
                  <div className="text-[10px] text-gray-400">Lương, thưởng, phụ cấp</div>
                </div>
              </div>
              <div className="px-5 py-2">
                <LineRow label="Lương cơ bản"       value={num(payroll.baseSalary)} alwaysShow />
                <LineRow label="Lương trách nhiệm"  value={num(payroll.responsibilitySalary)} />
                <LineRow label="Công số"            value={num(payroll.netWorkUnits)} format="number" alwaysShow />
                <LineRow label="Tổng lương CB"      value={num(payroll.workSalary)} alwaysShow />
                <LineRow label="Tổng Lương TN"      value={vars['sum_luong_tn'] ?? 0} alwaysShow />
                <LineRow label="Tiền tăng ca"       value={num(payroll.overtimePay)} alwaysShow />
                <LineRow label="Tiền ăn"            value={num(payroll.mealPay)} alwaysShow />
                <LineRow label="KPI chuyên cần"     value={num(payroll.kpiChuyenCan)} alwaysShow />
                <LineRow label="KPI hiệu suất"      value={vars['kpi_hieu_suat'] ?? 0} alwaysShow />
                <LineRow label="Tiền phụ cấp"       value={num(payroll.tienPhuCap)} alwaysShow onClick={num(payroll.tienPhuCap) ? () => setEntriesModal({ columnKey: 'tien_phu_cap', label: 'Tiền phụ cấp' }) : undefined} />
              </div>
              <div className="px-5 py-3 bg-green-50/40 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Tổng tạm tính</span>
                <span className="text-base font-bold text-green-700 tabular-nums">
                  {fmtVND(addTotal)} ₫
                </span>
              </div>
            </div>

            {/* Deductions */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                  <TrendingDown size={15}/>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">Các khoản trừ</div>
                  <div className="text-[10px] text-gray-400">Bảo hiểm, thuế, phạt</div>
                </div>
              </div>
              <div className="px-5 py-2">
                {showBhCols && (
                  <>
                    <LineRow label="BHXH (8%)" value={num(payroll.bhxhEmployee)} tone="negative"/>
                    <LineRow label="BHYT (1.5%)" value={num(payroll.bhytEmployee)} tone="negative"/>
                    <LineRow label="BHTN (1%)"  value={num(payroll.bhtnEmployee)} tone="negative"/>
                  </>
                )}
                {showPitCol && <LineRow label="Thuế TNCN" value={num(payroll.pitTax)} tone="negative"/>}
                <LineRow label="Tiền Trừ Khác" value={num(payroll.tienPhat)} tone="negative" alwaysShow onClick={num(payroll.tienPhat) ? () => setEntriesModal({ columnKey: 'tien_tru_khac', label: 'Tiền Trừ Khác' }) : undefined}/>
              </div>
              <div className="px-5 py-3 bg-red-50/40 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Các khoản trừ</span>
                <span className="text-base font-bold text-red-700 tabular-nums">
                  {subTotal > 0 ? '− ' : ''}{fmtVND(subTotal)} ₫
                </span>
              </div>
            </div>
          </div>

          {/* Summary recap */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Banknote size={18}/>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Số tiền bạn thực nhận</div>
                  <div className="text-xl md:text-2xl font-bold text-blue-700 tabular-nums">
                    {fmtVND(num(payroll.netSalary))} ₫
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400">Tổng tạm tính − Các khoản trừ</div>
                <div className="text-[11px] text-gray-500 tabular-nums">
                  {fmtVND(addTotal)} − {fmtVND(subTotal)}
                </div>
              </div>
            </div>
            {payroll.note && (
              <div className="mt-4 pt-4 border-t border-gray-100 text-[11px] text-gray-500">
                <span className="font-semibold text-gray-700">Ghi chú: </span>
                {payroll.note}
              </div>
            )}
          </div>

          {/* Approval history timeline */}
          <ApprovalHistory payrollId={payroll.id}/>
        </>
      )}

      {/* Entries breakdown modal (read-only for employee) */}
      {entriesModal && payroll && (
        <SalaryEntriesModal
          payrollId={payroll.id}
          columnKey={entriesModal.columnKey}
          columnLabel={entriesModal.label}
          canEdit={false}
          onClose={() => setEntriesModal(null)}
        />
      )}

      {/* Reject modal — employee notes reason when rejecting */}
      {rejectOpen && payroll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setRejectOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Từ chối bảng lương</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Ghi rõ lý do để admin chỉnh sửa.
                </p>
              </div>
              <button
                onClick={() => !submitting && setRejectOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18}/>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-[11px] font-semibold text-gray-600">
                Lý do (bắt buộc)
              </label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={4}
                autoFocus
                placeholder="VD: Thiếu phụ cấp tháng, tính sai tăng ca ngày 15..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectOpen(false)}
                disabled={submitting}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                Huỷ
              </button>
              <button
                onClick={handleReject}
                disabled={submitting || !rejectNote.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 font-semibold disabled:opacity-60"
              >
                <ThumbsDown size={13}/> {submitting ? 'Đang gửi...' : 'Gửi từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
