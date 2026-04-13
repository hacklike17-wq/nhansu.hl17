'use client'
import { useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, CheckCircle2, Clock, Lock, Banknote, Send, AlertTriangle, FileText } from 'lucide-react'
import { fmtVND } from '@/lib/format'
import { STATUS_MAP } from '@/app/luong/_lib/constants'

type PayrollRow = {
  id: string
  status: string
  month: string
  employee?: { fullName?: string; department?: string; position?: string }
  baseSalary: number | string
  responsibilitySalary: number | string
  workSalary: number | string
  overtimeHours: number | string
  overtimePay: number | string
  tienPhuCap: number | string
  kpiBonus: number | string
  kpiChuyenCan: number | string
  kpiTrachNhiem: number | string
  mealPay: number | string
  bonus: number | string
  grossSalary: number | string
  bhxhEmployee: number | string
  bhytEmployee: number | string
  bhtnEmployee: number | string
  pitTax: number | string
  tienPhat: number | string
  otherDeductions: number | string
  netSalary: number | string
  needsRecalc?: boolean
  note?: string | null
}

type Props = {
  payroll: PayrollRow | null
  month: string
  onMonthChange: (m: string) => void
  onSubmitForApproval?: (id: string) => Promise<void>
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

function LineRow({ label, value, tone = 'normal' }: { label: string; value: number; tone?: 'normal' | 'positive' | 'negative' | 'muted' }) {
  if (!value) return null
  const cls =
    tone === 'positive'
      ? 'text-gray-900'
      : tone === 'negative'
        ? 'text-red-600'
        : tone === 'muted'
          ? 'text-gray-500'
          : 'text-gray-900'
  const prefix = tone === 'negative' ? '− ' : ''
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className={`text-xs ${tone === 'muted' ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${cls}`}>{prefix}{fmtVND(value)} ₫</span>
    </div>
  )
}

export default function PersonalSalaryView({
  payroll,
  month,
  onMonthChange,
  onSubmitForApproval,
  showBhCols = true,
  showPitCol = true,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const num = (v: number | string | undefined | null) => Number(v ?? 0)

  async function handleSubmit() {
    if (!payroll || !onSubmitForApproval) return
    setSubmitting(true)
    setFeedback(null)
    try {
      await onSubmitForApproval(payroll.id)
      setFeedback('Đã gửi bảng lương để duyệt')
    } catch (e: any) {
      setFeedback(`Lỗi: ${e.message ?? 'Không thể gửi duyệt'}`)
    } finally {
      setSubmitting(false)
      setTimeout(() => setFeedback(null), 4000)
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
            {/* Actions */}
            {payroll.status === 'DRAFT' && onSubmitForApproval && (
              <div className="relative mt-5 pt-5 border-t border-white/10">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || payroll.needsRecalc}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-blue-700 font-semibold text-xs rounded-lg hover:bg-blue-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send size={13}/> {submitting ? 'Đang gửi...' : 'Gửi bảng lương để duyệt'}
                </button>
                {payroll.needsRecalc && (
                  <p className="text-[10px] text-blue-200 mt-2">
                    Không thể gửi khi bảng lương đang được cập nhật. Vui lòng chờ.
                  </p>
                )}
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
                <LineRow label="Lương cơ bản"       value={num(payroll.baseSalary)} />
                <LineRow label="Lương trách nhiệm"  value={num(payroll.responsibilitySalary)} />
                <LineRow label="Lương công thực tế" value={num(payroll.workSalary)} tone="muted"/>
                <LineRow label="Tiền tăng ca"       value={num(payroll.overtimePay)} />
                <LineRow label="KPI chuyên cần"     value={num(payroll.kpiChuyenCan)} />
                <LineRow label="KPI trách nhiệm"    value={num(payroll.kpiTrachNhiem)} />
                <LineRow label="Thưởng KPI"         value={num(payroll.kpiBonus)} />
                <LineRow label="Thưởng khác"        value={num(payroll.bonus)} />
                <LineRow label="Phụ cấp"            value={num(payroll.tienPhuCap)} />
                <LineRow label="Tiền ăn"            value={num(payroll.mealPay)} />
              </div>
              <div className="px-5 py-3 bg-green-50/40 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Tổng gross</span>
                <span className="text-base font-bold text-green-700 tabular-nums">
                  {fmtVND(num(payroll.grossSalary))} ₫
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
                <LineRow label="Phạt"          value={num(payroll.tienPhat)} tone="negative"/>
                <LineRow label="Trừ khác"      value={num(payroll.otherDeductions)} tone="negative"/>
              </div>
              <div className="px-5 py-3 bg-red-50/40 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Tổng trừ</span>
                <span className="text-base font-bold text-red-700 tabular-nums">
                  − {fmtVND(
                    num(payroll.bhxhEmployee) +
                    num(payroll.bhytEmployee) +
                    num(payroll.bhtnEmployee) +
                    num(payroll.pitTax) +
                    num(payroll.tienPhat) +
                    num(payroll.otherDeductions)
                  )} ₫
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
                <div className="text-[10px] text-gray-400">Gross − Trừ</div>
                <div className="text-[11px] text-gray-500 tabular-nums">
                  {fmtVND(num(payroll.grossSalary))} −{' '}
                  {fmtVND(
                    num(payroll.grossSalary) - num(payroll.netSalary)
                  )}
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
        </>
      )}
    </div>
  )
}
