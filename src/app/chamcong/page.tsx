'use client'
import { useState, useMemo, useRef, useCallback } from 'react'
import PageShell from '@/components/layout/PageShell'
import { useAuth } from '@/components/auth/AuthProvider'
import { useEmployees } from '@/hooks/useEmployees'
import { useWorkUnits, upsertWorkUnit, deleteEmployeeMonth } from '@/hooks/useWorkUnits'
import { useDeductions } from '@/hooks/useDeductions'
import { useKpiViolations, upsertKpiViolation } from '@/hooks/useKpiViolations'
import { useOvertimeEntries, upsertOvertimeEntry } from '@/hooks/useOvertimeEntries'
import type { KpiViolationType } from '@/types'
import { X, Calendar, Trash2, Sparkles, AlertTriangle } from 'lucide-react'

/* ══════════���════════════════════════════════════════
   SHARED HELPERS
   ══════════��═════════════════════════════���══════════ */
function getDays(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const total = new Date(y, m, 0).getDate()
  return Array.from({ length: total }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, '0')}`)
}

/**
 * Tuần làm 6 ngày: Thứ 2 → Thứ 7. Chỉ Chủ nhật là cuối tuần.
 * (Trước đây Sat+Sun đều cuối tuần — đã đổi theo lịch làm việc thực tế.)
 */
function isWeekend(date: string): boolean {
  const dow = new Date(date + 'T00:00:00').getDay()
  return dow === 0 // chỉ Sun
}

function dayNum(date: string): string { return date.slice(8) }

// Normalize date from DB (may be ISO string or Date) to YYYY-MM-DD
function toDateStr(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

/* ══════���═════════════════════���══════════════════════
   TABLE 1 — CÔNG SỐ
   ════════════════════════════════════════���══════════ */
function attCls(units: number | null): string {
  if (units === null)   return 'text-gray-300'
  if (units >= 1.5)     return 'bg-blue-50 text-blue-700'
  if (units === 1.0)    return 'bg-green-50 text-green-700'
  if (units > 0)        return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-500'
}
function attLabel(units: number | null): string {
  if (units === null) return '·'
  if (units === 1.0)  return '1'
  if (units === 0.5)  return '½'
  return units.toFixed(1)
}

/* ═══════════════════════════════════════════════════
   TABLE 2 — GIỜ TĂNG CA (inline from WorkUnit note for now)
   ══════��════════════════════════════════════════════ */
function otLabel(hours: number | null): string {
  if (hours === null) return '·'
  return `${hours}h`
}

/* ══════════════��════════════════════════════════════
   TABLE 3 — KPI CHUYÊN CẦN
   ═══════════════════════════════════════════════════ */
const KPI_CONFIG: Record<KpiViolationType, { full: string; cls: string; dot: string }> = {
  DM: { full: 'Đi muộn',          cls: 'bg-amber-100 text-amber-700 border-amber-200',     dot: 'bg-amber-400' },
  NP: { full: 'Nghỉ phép',        cls: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-400'  },
  NS: { full: 'Nghỉ sai',         cls: 'bg-red-100 text-red-700 border-red-200',          dot: 'bg-red-400'   },
  KL: { full: 'Không lương',      cls: 'bg-rose-100 text-rose-800 border-rose-200',       dot: 'bg-rose-500'  },
  QC: { full: 'Quên chấm công',   cls: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
}
const KPI_TYPES = Object.keys(KPI_CONFIG) as KpiViolationType[]

/* ════��══════════════════════════════════════════════
   LOG DRAWER DATA
   ═══════════════════════════════════════════════════ */
const DED_TYPE_MAP: Record<string, { label: string; cls: string }> = {
  NGHI_NGAY: { label: 'Nghỉ ngày',  cls: 'bg-red-50 text-red-700 border-red-200' },
  DI_MUON:   { label: 'Đi muộn',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  VE_SOM:    { label: 'Về sớm',     cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  OVERTIME:  { label: 'Tăng ca',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}
const DED_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: 'Chờ duyệt', cls: 'text-amber-600' },
  APPROVED: { label: 'Đã duyệt',  cls: 'text-green-600' },
  REJECTED: { label: 'Từ chối',   cls: 'text-red-500'   },
}

/* ═════════════════════════════════════════════════════
   SHARED TABLE CHROME — fixed layout để thẳng cột
   ═════════════════════════════════════════════════════ */
const COL_W    = 'w-7'         // 28px day col min
const EMP_W    = 'w-40'        // 160px employee col
const TOT_W    = 72            // px — Tổng col (rightmost, đồng nhất 3 bảng)
const LOG_W    = 48            // px — Log col (Table 1 only, left of Tổng)
const STICKY   = `sticky left-0 z-10 bg-white border-r border-gray-100 ${EMP_W}`
const STICKY_H = `sticky left-0 z-20 bg-gray-50 border-r border-gray-100 ${EMP_W}`
// sticky-right — Tổng col (rightmost, all tables)
const SR_H = 'sticky z-20 border-l-2 border-gray-200 bg-blue-50/60 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)]'
const SR   = 'sticky z-10 border-l-2 border-gray-200 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)]'
// sticky-right Log col (Table 1 only, sits left of Tổng)
const SRL_H = 'sticky z-20 bg-gray-50 border-l border-gray-100'
const SRL   = 'sticky z-10 border-l border-gray-100'

/* ═══════════════════════════════════════════════════
   PAGE COMPONENT
   ══════════════════════════════════════════��════════ */
export default function ChamCongPage() {
  const { user } = useAuth()
  const isManager = user?.role !== 'employee'

  const todayMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(todayMonth)
  const days = useMemo(() => getDays(month), [month])
  const [initializing, setInitializing] = useState(false)
  const [initMsg, setInitMsg] = useState<string | null>(null)

  // API data
  const { employees: rawEmployees } = useEmployees()
  const { workUnits: rawWorkUnits, mutate: mutateWU } = useWorkUnits({ month })
  const { deductions: rawDeductions } = useDeductions({ month })
  const { kpiViolations: rawKpi, mutate: mutateKpi } = useKpiViolations({ month })
  const { overtimeEntries: rawOT, mutate: mutateOT } = useOvertimeEntries({ month })

  // Normalize employees
  const employees = useMemo(() => rawEmployees.map((e: any) => ({
    ...e,
    name: e.fullName, // backward compat
  })), [rawEmployees])

  // Filter targets
  const targets = useMemo(
    () => isManager
      ? employees.filter((e: any) => e.accountStatus !== 'NO_ACCOUNT')
      : employees.filter((e: any) => e.id === user?.employeeId),
    [isManager, employees, user]
  )

  // Normalize WorkUnits — date → YYYY-MM-DD string
  const attendance = useMemo(() => rawWorkUnits.map((w: any) => ({
    ...w,
    date: toDateStr(w.date),
    units: typeof w.units === 'string' ? parseFloat(w.units) : w.units,
  })), [rawWorkUnits])

  // Normalize deductions
  const deductions = useMemo(() => rawDeductions.map((d: any) => ({
    ...d,
    date: toDateStr(d.date),
    delta: typeof d.delta === 'string' ? parseFloat(d.delta) : d.delta,
    status: d.status, // Already uppercase from DB
  })), [rawDeductions])

  // Normalize kpiViolations
  const kpiViolations = useMemo(() => rawKpi.map((k: any) => ({
    ...k,
    date: toDateStr(k.date),
  })), [rawKpi])

  /* ── Scroll sync ── */
  const scrollRef1 = useRef<HTMLDivElement>(null)
  const scrollRef2 = useRef<HTMLDivElement>(null)
  const scrollRef3 = useRef<HTMLDivElement>(null)
  const syncing    = useRef(false)

  const syncScroll = useCallback((src: HTMLDivElement) => {
    if (syncing.current) return
    syncing.current = true
    const left = src.scrollLeft
    ;[scrollRef1, scrollRef2, scrollRef3].forEach(r => {
      if (r.current && r.current !== src) r.current.scrollLeft = left
    })
    syncing.current = false
  }, [])

  // Normalize overtime
  const overtimeEntries = useMemo(() => rawOT.map((o: any) => ({
    ...o,
    date: toDateStr(o.date),
    hours: typeof o.hours === 'string' ? parseFloat(o.hours) : o.hours,
  })), [rawOT])

  /* ── Fast lookup maps ── */
  const attMap = useMemo(() => {
    const m: Record<string, any> = {}
    attendance.filter((a: any) => a.date.startsWith(month)).forEach((a: any) => { m[`${a.employeeId}|${a.date}`] = a })
    return m
  }, [attendance, month])

  const kpiMap = useMemo(() => {
    const m: Record<string, any> = {}
    kpiViolations.filter((k: any) => k.date.startsWith(month)).forEach((k: any) => { m[`${k.employeeId}|${k.date}`] = k })
    return m
  }, [kpiViolations, month])

  const otMap = useMemo(() => {
    const m: Record<string, any> = {}
    overtimeEntries.filter((o: any) => o.date.startsWith(month)).forEach((o: any) => { m[`${o.employeeId}|${o.date}`] = o })
    return m
  }, [overtimeEntries, month])

  /* ══════════════ SHARED: error state cho 3 modal (cell edit) ══════════════ */
  const [saveError, setSaveError] = useState<string | null>(null)

  /**
   * Format lỗi từ server response để hiện trong modal.
   * Hook upsert ném Error(res.text()) là JSON string, cần parse trước.
   * Ưu tiên bắt case "bảng lương đã khoá" (HTTP 409 từ chamcong-guard) và
   * enrich với tên NV + tháng để user hiểu ngay.
   */
  function formatSaveError(e: any, empName: string, date: string): string {
    // e.message là JSON string từ res.text() — parse để lấy .error
    let raw = e?.message ?? 'Không rõ lỗi'
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.error === 'string') raw = parsed.error
    } catch {
      // không phải JSON, giữ nguyên raw
    }

    const monthOfDate = date.slice(0, 7) // YYYY-MM
    const mm = monthOfDate.slice(5)
    const yy = monthOfDate.slice(0, 4)

    // chamcong-guard message: "Không thể sửa — bảng lương tháng này đang ở trạng thái "..."
    if (typeof raw === 'string' && raw.includes('bảng lương')) {
      const match = raw.match(/"([^"]+)"/)
      const status = match?.[1] ?? ''
      return `Không thể chỉnh sửa — bảng lương tháng ${mm}/${yy} của ${empName} đang ở trạng thái "${status}". Bạn không thể sửa công số, tăng ca hay KPI của nhân viên này cho tháng này nữa.`
    }

    return `Không thể lưu — ${raw}`
  }

  /* ══════════════ TABLE 1: CÔNG SỐ ══════════════ */
  type AttEdit = { empId: string; empName: string; date: string }
  const [attEdit, setAttEdit] = useState<AttEdit | null>(null)
  const [attVal,  setAttVal]  = useState<number>(1.0)
  const [attNote, setAttNote] = useState<string>('')
  const [saving,  setSaving]  = useState(false)
  const QUICK = [0, 0.5, 1.0, 1.5, 2.0]

  function openAttEdit(empId: string, empName: string, date: string) {
    if (!isManager) return
    const existing = attMap[`${empId}|${date}`]
    setAttVal(existing?.units ?? 1.0)
    setAttNote(existing?.note ?? '')
    setSaveError(null)
    setAttEdit({ empId, empName, date })
  }
  async function saveAtt() {
    if (!attEdit) return
    setSaving(true)
    setSaveError(null)
    try {
      await upsertWorkUnit({
        employeeId: attEdit.empId,
        date: attEdit.date,
        units: attVal,
        note: attNote.trim() || undefined,
      })
      await mutateWU()
      setAttEdit(null)
    } catch (e: any) {
      setSaveError(formatSaveError(e, attEdit.empName, attEdit.date))
      // Giữ modal mở để user đọc message + đóng thủ công
    } finally {
      setSaving(false)
    }
  }

  /* ══════════════ PHASE 04: DELETE EMPLOYEE WORK-UNITS ══════════════ */
  async function handleDeleteEmployeeMonth(emp: any) {
    if (!confirm(`Xóa toàn bộ công số của ${emp.fullName} trong tháng ${month}?`)) return
    try {
      await deleteEmployeeMonth(emp.id, month)
      await mutateWU()
    } catch (e: any) {
      alert(e.message)
    }
  }

  /* ══════════════ AUTO-FILL — chấm tự động đến hôm nay (Mon-Sat) ══════════════ */
  async function handleInitMonth() {
    if (!isManager || initializing) return
    setInitializing(true)
    setInitMsg(null)
    try {
      const res = await fetch('/api/work-units/auto-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Không thể cập nhật')
      await mutateWU()

      const monthLabel = data.monthLabel ?? month
      const created = data.created ?? 0
      const leaveZeroes = data.createdLeaveZeroes ?? 0
      const skipped = data.skippedExisting ?? 0

      if (created === 0 && leaveZeroes === 0) {
        setInitMsg(`Tháng ${monthLabel}: đã đồng bộ — ${skipped} ngày đã có sẵn`)
      } else {
        const parts: string[] = []
        if (created > 0) parts.push(`+${created} ngày công`)
        if (leaveZeroes > 0) parts.push(`+${leaveZeroes} ngày nghỉ KL`)
        if (skipped > 0) parts.push(`giữ ${skipped} ô đã có`)
        setInitMsg(`Tháng ${monthLabel}: ${parts.join(' · ')}`)
      }
    } catch (e: any) {
      setInitMsg(`Lỗi: ${e.message}`)
    } finally {
      setInitializing(false)
      setTimeout(() => setInitMsg(null), 5000)
    }
  }

  /* ══════════════ TABLE 2: TĂNG CA ══════════════ */
  type OtEdit = { empId: string; empName: string; date: string }
  const [otEdit,    setOtEdit]    = useState<OtEdit | null>(null)
  const [otHours,   setOtHours]   = useState<number>(0)
  const [otNote,    setOtNote]    = useState<string>('')
  const [otSaving,  setOtSaving]  = useState(false)

  function openOtEdit(empId: string, empName: string, date: string) {
    if (!isManager) return
    const existing = otMap[`${empId}|${date}`]
    setOtHours(existing?.hours ?? 0)
    setOtNote(existing?.note ?? '')
    setSaveError(null)
    setOtEdit({ empId, empName, date })
  }
  async function saveOt() {
    if (!otEdit) return
    setOtSaving(true)
    setSaveError(null)
    try {
      await upsertOvertimeEntry({ employeeId: otEdit.empId, date: otEdit.date, hours: otHours, note: otNote })
      await mutateOT()
      setOtEdit(null)
    } catch (e: any) {
      setSaveError(formatSaveError(e, otEdit.empName, otEdit.date))
    } finally {
      setOtSaving(false)
    }
  }

  /* ══════════════ TABLE 3: KPI ══════════════ */
  type KpiEdit = { empId: string; empName: string; date: string }
  const [kpiEdit,      setKpiEdit]      = useState<KpiEdit | null>(null)
  const [kpiSelected,  setKpiSelected]  = useState<KpiViolationType[]>([])
  const [kpiNote,      setKpiNote]      = useState<string>('')

  function openKpiEdit(empId: string, empName: string, date: string) {
    if (!isManager) return
    const existing = kpiMap[`${empId}|${date}`]
    setKpiSelected(existing?.types ?? [])
    setKpiNote(existing?.note ?? '')
    setSaveError(null)
    setKpiEdit({ empId, empName, date })
  }
  function toggleKpiType(t: KpiViolationType) {
    setKpiSelected(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }
  async function saveKpi() {
    if (!kpiEdit) return
    setSaveError(null)
    try {
      await upsertKpiViolation({ employeeId: kpiEdit.empId, date: kpiEdit.date, types: kpiSelected, note: kpiNote })
      await mutateKpi()
      setKpiEdit(null)
    } catch (e: any) {
      setSaveError(formatSaveError(e, kpiEdit.empName, kpiEdit.date))
    }
  }

  /* ══════════════ LOG DRAWER ══════════════ */
  type LogState = { empId: string; empName: string }
  const [logState, setLogState] = useState<LogState | null>(null)
  type DrawerTab = 'data' | 'history'
  const [logTab, setLogTab] = useState<DrawerTab>('data')

  // Audit log fetched on demand when drawer opens "history" tab
  type AuditEntry = {
    id: string
    entityType: string
    action: string
    changedBy: string | null
    changedByName: string | null
    changes: any
    createdAt: string
  }
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  // Fetch audit when switching to history tab
  async function fetchAudit(empId: string) {
    setAuditLoading(true)
    try {
      const url = `/api/chamcong/audit-log?employeeId=${empId}&month=${month}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()
      setAuditEntries(data.entries ?? [])
    } catch (e) {
      console.error('fetchAudit error:', e)
      setAuditEntries([])
    } finally {
      setAuditLoading(false)
    }
  }

  // Reset tab + load audit when drawer opens
  function openLogDrawer(empId: string, empName: string) {
    setLogState({ empId, empName })
    setLogTab('data')
    setAuditEntries([])
  }

  /* ── ColGroup: employee + extra cols fixed, day cols flex ──
     Table 1: extraCols = [LOG_W, TOT_W]  (Log left of Tổng)
     Table 2/3: extraCols = [TOT_W]
     → Tổng/Vi phạm is ALWAYS the rightmost col → thẳng hàng tuyệt đối ── */
  function TableCols({ extraCols = [TOT_W] }: { extraCols?: number[] }) {
    return (
      <colgroup>
        <col style={{ width: 160, minWidth: 160 }} />
        {days.map(d => <col key={d} style={{ minWidth: 26 }} />)}
        {extraCols.map((w, i) => <col key={`ec-${i}`} style={{ width: w, minWidth: w }} />)}
      </colgroup>
    )
  }

  /* ── Shared th for day columns ── */
  function DayHeaders() {
    return (
      <>
        {days.map(date => (
          <th key={date} className={`${COL_W} py-2.5 text-center text-[11px] font-semibold ${isWeekend(date) ? 'text-gray-300' : 'text-gray-400'}`}>
            {dayNum(date)}
          </th>
        ))}
      </>
    )
  }

  /* ── Weekend overlay in td ── */
  function wkCls(date: string, extra = '') {
    return `${COL_W} text-center border-r border-gray-50 relative ${isWeekend(date) ? 'bg-gray-50/50' : ''} ${extra}`
  }

  return (
    <PageShell breadcrumb="Nhân sự" title="Công số">

      <div className="max-w-screen-2xl">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-400">Tháng</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 h-8" />
        </div>
        {isManager && (() => {
          // Classify the selected month vs today (local) for context-aware UI
          const todayYm = new Date().toISOString().slice(0, 7) // "YYYY-MM"
          const isFuture = month > todayYm
          const isPast = month < todayYm
          const label = initializing
            ? 'Đang cập nhật...'
            : isFuture
              ? 'Tháng tương lai'
              : isPast
                ? 'Khởi tạo công cho tháng này'
                : 'Cập nhật công đến hôm nay'
          const tooltip = isFuture
            ? 'Không thể chấm công cho tháng tương lai'
            : isPast
              ? 'Tạo 1 công/ngày cho toàn bộ ngày làm việc (Mon-Sat) của tháng đã chọn. Bỏ qua Chủ nhật và ngày nghỉ không lương đã duyệt.'
              : 'Tự động chấm 1 công/ngày từ đầu tháng đến hôm nay (Mon-Sat). Bỏ qua Chủ nhật và ngày nghỉ không lương đã duyệt. Không ghi đè ô đã chỉnh.'
          return (
            <button
              onClick={handleInitMonth}
              disabled={initializing || isFuture}
              className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
              title={tooltip}
            >
              <Sparkles size={13}/>
              {label}
            </button>
          )
        })()}
        {initMsg && (
          <span className={`text-[11px] font-medium ${initMsg.startsWith('Lỗi') ? 'text-red-500' : 'text-green-600'}`}>
            {initMsg}
          </span>
        )}
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2.5 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300 inline-block" /> 1 công</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> ½ công</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 inline-block" /> OT</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-100 border border-orange-300 inline-block" /> Tăng ca</span>
        </div>
      </div>

      {/* TABLE 1: BẢNG CÔNG SỐ */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-3.5 bg-blue-500 rounded-full" />
            <h3 className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Bảng công số</h3>
          </div>
          {isManager && <span className="text-[10px] text-gray-400">↖ Click ô để chỉnh</span>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full">
          <div ref={scrollRef1} className="overflow-x-auto" onScroll={e => syncScroll(e.currentTarget)}>
            <table className="text-[12px] border-collapse table-fixed w-full">
              <TableCols extraCols={isManager ? [LOG_W, TOT_W] : [TOT_W]} />
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className={`${STICKY_H} px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide`}>Nhân viên</th>
                  <DayHeaders />
                  {isManager && <th className={`${SRL_H} px-2 py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap`}
                    style={{ right: TOT_W, width: LOG_W }}>Log</th>}
                  <th className={`${SR_H} right-0 px-2 py-2 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap`}
                    style={{ right: 0, width: TOT_W }}>Tổng</th>
                </tr>
              </thead>
              <tbody>
                {targets.length === 0 ? (
                  <tr><td colSpan={days.length + (isManager ? 3 : 2)} className="px-4 py-8 text-center text-sm text-gray-400">Chưa có nhân viên</td></tr>
                ) : targets.map((emp: any) => {
                  const total = days.reduce((s, d) => s + (attMap[`${emp.id}|${d}`]?.units ?? 0), 0)
                  return (
                    <tr key={emp.id} className="group border-b border-gray-50 hover:bg-blue-50/10">
                      <td className={`${STICKY} px-3 py-1.5 group-hover:bg-blue-50/10`}>
                        <div className="font-medium text-gray-800 truncate">{emp.fullName}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 truncate">{emp.department}</span>
                          {isManager && (
                            <button onClick={() => handleDeleteEmployeeMonth(emp)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-300 hover:text-red-500"
                              title="Xóa công số tháng này">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </td>
                      {days.map(date => {
                        const wu = attMap[`${emp.id}|${date}`]
                        const units = wu?.units ?? null
                        const tip = wu?.note
                          ? `${attLabel(units)} công\n${wu.note}`
                          : undefined
                        return (
                          <td key={date} title={tip}
                            onClick={() => openAttEdit(emp.id, emp.fullName, date)}
                            className={`${wkCls(date, 'py-1 font-semibold select-none')} ${attCls(units)} ${isManager ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-blue-400 hover:z-10' : ''} ${wu?.note ? 'ring-1 ring-blue-300/50 ring-inset' : ''}`}>
                            {attLabel(units)}
                          </td>
                        )
                      })}
                      {isManager && (
                        <td className={`${SRL} bg-white group-hover:bg-blue-50/10 px-1.5 py-1.5 text-center`}
                          style={{ right: TOT_W, width: LOG_W }}>
                          <button onClick={() => openLogDrawer(emp.id, emp.fullName)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 transition-colors">
                            <Calendar size={10} /> Log
                          </button>
                        </td>
                      )}
                      <td className={`${SR} bg-blue-50/40 group-hover:bg-blue-100/50 right-0 px-2 py-1.5 text-right font-bold text-blue-700 whitespace-nowrap`}
                        style={{ right: 0, width: TOT_W }}>
                        {total.toFixed(1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TABLE 2: BẢNG GIỜ TĂNG CA */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-3.5 bg-orange-400 rounded-full" />
            <h3 className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Giờ tăng ca</h3>
          </div>
          {isManager && <span className="text-[10px] text-gray-400">↖ Click ô để nhập · 0 = xóa</span>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full">
          <div ref={scrollRef2} className="overflow-x-auto" onScroll={e => syncScroll(e.currentTarget)}>
            <table className="text-[12px] border-collapse table-fixed w-full">
              <TableCols extraCols={isManager ? [LOG_W, TOT_W] : [TOT_W]} />
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className={`${STICKY_H} px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide`}>Nhân viên</th>
                  <DayHeaders />
                  {isManager && <th className={`${SRL_H} px-2 py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap`}
                    style={{ right: TOT_W, width: LOG_W }}>Log</th>}
                  <th className={`${SR_H} right-0 px-2 py-2 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap`}
                    style={{ right: 0, width: TOT_W }}>Tổng</th>
                </tr>
              </thead>
              <tbody>
                {targets.length === 0 ? (
                  <tr><td colSpan={days.length + (isManager ? 3 : 2)} className="px-4 py-6 text-center text-sm text-gray-400">Chưa có nhân viên</td></tr>
                ) : targets.map((emp: any) => {
                  const totalOt = days.reduce((s, d) => s + (otMap[`${emp.id}|${d}`]?.hours ?? 0), 0)
                  return (
                    <tr key={emp.id} className="group border-b border-gray-50 hover:bg-orange-50/10">
                      <td className={`${STICKY} px-3 py-1.5 group-hover:bg-orange-50/10`}>
                        <div className="font-medium text-gray-800 truncate">{emp.fullName}</div>
                        <div className="text-[10px] text-gray-400 truncate">{emp.department}</div>
                      </td>
                      {days.map(date => {
                        const ot = otMap[`${emp.id}|${date}`]
                        const h  = ot?.hours ?? null
                        const tip = h !== null ? `${h}h${ot?.note ? '\n' + ot.note : ''}` : undefined
                        return (
                          <td key={date} title={tip}
                            onClick={() => openOtEdit(emp.id, emp.fullName, date)}
                            className={`${wkCls(date, 'py-1 select-none')} ${h !== null ? 'bg-orange-50' : ''} ${isManager ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-orange-400 hover:z-10' : ''}`}>
                            {h !== null
                              ? <span className="font-semibold text-orange-600 text-[11px]">{h}h</span>
                              : <span className="text-gray-300 text-[11px]">·</span>}
                          </td>
                        )
                      })}
                      {isManager && (
                        <td className={`${SRL} bg-white group-hover:bg-orange-50/10 px-1.5 py-1.5 text-center`}
                          style={{ right: TOT_W, width: LOG_W }}>
                          <button onClick={() => openLogDrawer(emp.id, emp.fullName)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-orange-600 hover:bg-orange-50 border border-orange-200 transition-colors">
                            <Calendar size={10} /> Log
                          </button>
                        </td>
                      )}
                      <td className={`${SR} bg-orange-50/40 group-hover:bg-orange-100/50 right-0 px-2 py-1.5 text-right font-bold whitespace-nowrap`}
                        style={{ right: 0, width: TOT_W }}>
                        {totalOt > 0
                          ? <span className="text-orange-600">{totalOt}h</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          TABLE 3: BẢNG KPI CHUYÊN CẦN
          ══════════════════════════════════════════ */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-3.5 bg-rose-500 rounded-full" />
            <h3 className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">KPI chuyên cần</h3>
            <div className="flex flex-wrap gap-1 ml-1">
              {KPI_TYPES.map(t => (
                <span key={t} className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[9px] font-semibold border ${KPI_CONFIG[t].cls}`}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          {isManager && <span className="text-[10px] text-gray-400">↖ Click ô để nhập vi phạm</span>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full">
          <div ref={scrollRef3} className="overflow-x-auto" onScroll={e => syncScroll(e.currentTarget)}>
            <table className="text-[12px] border-collapse table-fixed w-full">
              <TableCols extraCols={isManager ? [LOG_W, TOT_W] : [TOT_W]} />
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className={`${STICKY_H} px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide`}>
                    Nhân viên
                  </th>
                  <DayHeaders />
                  {isManager && <th className={`${SRL_H} px-2 py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap`}
                    style={{ right: TOT_W, width: LOG_W }}>Log</th>}
                  <th className={`${SR_H} right-0 px-2 py-2 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap`}
                    style={{ right: 0, width: TOT_W }}>
                    Vi phạm
                  </th>
                </tr>
              </thead>
              <tbody>
                {targets.map((emp: any) => {
                  const monthKpis = kpiViolations.filter((k: any) => k.employeeId === emp.id && k.date.startsWith(month))
                  const totalV    = monthKpis.reduce((s: number, k: any) => s + k.types.length, 0)
                  const breakdown = KPI_TYPES.reduce((acc, t) => {
                    acc[t] = monthKpis.filter((k: any) => k.types.includes(t)).length
                    return acc
                  }, {} as Record<KpiViolationType, number>)

                  return (
                    <tr key={emp.id} className="group border-b border-gray-50 hover:bg-rose-50/10">
                      <td className={`${STICKY} px-3 py-1.5 group-hover:bg-rose-50/10`}>
                        <div className="font-medium text-gray-900 text-[11px]">{emp.fullName}</div>
                        <div className="text-[10px] text-gray-400">{emp.department}</div>
                      </td>
                      {days.map(date => {
                        const vio   = kpiMap[`${emp.id}|${date}`]
                        const types = vio?.types ?? []
                        const tip   = types.length > 0
                          ? types.map((t: KpiViolationType) => KPI_CONFIG[t]?.full ?? t).join(', ') + (vio?.note ? '\n' + vio.note : '')
                          : undefined
                        return (
                          <td key={date} title={tip}
                            onClick={() => openKpiEdit(emp.id, emp.fullName, date)}
                            className={`${wkCls(date, 'py-1 select-none')} ${isManager ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-rose-400 hover:z-10' : ''}`}>
                            {types.length === 0 ? (
                              <span className="text-gray-300 text-[11px]">·</span>
                            ) : types.length === 1 ? (
                              <span className={`inline-block px-1 rounded text-[9px] font-bold border ${KPI_CONFIG[types[0] as KpiViolationType]?.cls ?? ''}`}>{types[0]}</span>
                            ) : (
                              <div className="flex flex-col gap-px items-center">
                                {types.slice(0, 2).map((t: string) => (
                                  <span key={t} className={`inline-block px-1 rounded text-[8px] font-bold border leading-tight ${KPI_CONFIG[t as KpiViolationType]?.cls ?? ''}`}>{t}</span>
                                ))}
                                {types.length > 2 && <span className="text-[8px] text-gray-400">+{types.length - 2}</span>}
                              </div>
                            )}
                          </td>
                        )
                      })}

                      {isManager && (
                        <td className={`${SRL} bg-white group-hover:bg-rose-50/10 px-1.5 py-1.5 text-center`}
                          style={{ right: TOT_W, width: LOG_W }}>
                          <button onClick={() => openLogDrawer(emp.id, emp.fullName)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors">
                            <Calendar size={10} /> Log
                          </button>
                        </td>
                      )}
                      <td className={`${SR} bg-rose-50/40 group-hover:bg-rose-100/50 right-0 px-2 py-1.5 text-right`}
                        style={{ right: 0, width: TOT_W }}>
                        {totalV === 0 ? (
                          <span className="text-gray-300 text-[11px]">—</span>
                        ) : (
                          <div>
                            <div className="font-bold text-rose-600 text-sm">{totalV}</div>
                            <div className="flex flex-col gap-0.5 mt-0.5 items-end">
                              {KPI_TYPES.filter(t => breakdown[t] > 0).map(t => (
                                <span key={t} className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-semibold border ${KPI_CONFIG[t].cls}`}>
                                  {t}:{breakdown[t]}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      </div>{/* /max-w-screen-2xl */}

      {/* ══════════════════════════════════════════
          MODAL: EDIT CÔNG SỐ
          ═════════════════════════��════════════════ */}
      {attEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAttEdit(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-72 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{attEdit.empName}</p>
                <p className="text-xs text-gray-400">{attEdit.date} · Công số</p>
              </div>
              <button onClick={() => setAttEdit(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Chọn nhanh</p>
            <div className="flex gap-2 mb-4">
              {QUICK.map(v => (
                <button key={v} onClick={() => setAttVal(v)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${attVal === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'}`}>
                  {v === 0 ? '0' : v === 0.5 ? '½' : v}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-medium text-gray-500 mb-1.5">Tùy chỉnh</p>
            <input type="number" step={0.25} min={0} max={3} value={attVal}
              onChange={e => setAttVal(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 mb-4" />
            <p className="text-[11px] font-medium text-gray-500 mb-1.5">
              Ghi chú <span className="text-gray-300 font-normal">(tuỳ chọn)</span>
            </p>
            <textarea
              value={attNote}
              onChange={e => setAttNote(e.target.value)}
              rows={2}
              placeholder="VD: nửa ngày sáng, làm bù ngày T2..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 mb-4 resize-none"
              maxLength={200}
            />
            {saveError && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11px]">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <span className="leading-relaxed">{saveError}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setAttEdit(null); setSaveError(null) }} className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Đóng</button>
              <button onClick={saveAtt} disabled={saving} className="flex-1 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: EDIT TĂNG CA
          ══════════════════════════════════════════ */}
      {otEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOtEdit(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-72 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{otEdit.empName}</p>
                <p className="text-xs text-gray-400">{otEdit.date} · Tăng ca</p>
              </div>
              <button onClick={() => setOtEdit(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>

            <div className="mb-3">
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Số giờ tăng ca</label>
              <div className="flex gap-1.5 mb-2">
                {[0, 1, 1.5, 2, 2.5, 3].map(v => (
                  <button key={v} onClick={() => setOtHours(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${otHours === v ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-700 border-gray-200 hover:border-orange-400'}`}>
                    {v === 0 ? 'Xóa' : `${v}h`}
                  </button>
                ))}
              </div>
              <input type="number" step={0.5} min={0} max={12} value={otHours}
                onChange={e => setOtHours(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Ghi chú</label>
              <input type="text" value={otNote} onChange={e => setOtNote(e.target.value)}
                placeholder="Lý do tăng ca..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
            </div>

            {saveError && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11px]">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <span className="leading-relaxed">{saveError}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setOtEdit(null); setSaveError(null) }} className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Đóng</button>
              <button onClick={saveOt} disabled={otSaving}
                className="flex-1 py-2 text-xs font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-60">
                {otSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: EDIT KPI
          ══════════════════════════════════════════ */}
      {kpiEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setKpiEdit(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-80 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{kpiEdit.empName}</p>
                <p className="text-xs text-gray-400">{kpiEdit.date} · KPI Chuyên cần</p>
              </div>
              <button onClick={() => setKpiEdit(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Loại vi phạm (chọn nhiều)</p>
            <div className="space-y-2 mb-4">
              {KPI_TYPES.map(t => (
                <label key={t} className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${kpiSelected.includes(t) ? KPI_CONFIG[t].cls + ' border-opacity-100' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="checkbox" checked={kpiSelected.includes(t)} onChange={() => toggleKpiType(t)}
                    className="rounded border-gray-300 text-rose-600 focus:ring-rose-500" />
                  <div>
                    <span className="text-xs font-bold">{t}</span>
                    <span className="text-[11px] text-gray-500 ml-2">— {KPI_CONFIG[t].full}</span>
                  </div>
                </label>
              ))}
            </div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Ghi chú</label>
            <input type="text" value={kpiNote} onChange={e => setKpiNote(e.target.value)} placeholder="Ghi chú vi phạm..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 mb-4" />
            {saveError && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11px]">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <span className="leading-relaxed">{saveError}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setKpiEdit(null); setSaveError(null) }} className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Đóng</button>
              <button onClick={saveKpi} className="flex-1 py-2 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700">Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LOG DRAWER
          ════════════════════════════════════���═════ */}
      {logState && (() => {
        const days4log   = getDays(month)
        const logUnits   = Object.fromEntries(attendance.filter((a: any) => a.employeeId === logState.empId && a.date.startsWith(month)).map((a: any) => [a.date, a.units]))
        const logDeds    = deductions.filter((d: any) => d.employeeId === logState.empId && d.date.startsWith(month))
        const logKpi     = Object.fromEntries(kpiViolations.filter((k: any) => k.employeeId === logState.empId && k.date.startsWith(month)).map((k: any) => [k.date, k]))
        const totalUnits = Object.values(logUnits).reduce((s: number, v: any) => s + v, 0)
        const totalViols = Object.values(logKpi).reduce((s: number, k: any) => s + k.types.length, 0)

        return (
          <div className="fixed inset-0 z-50 flex" onClick={() => setLogState(null)}>
            <div className="flex-1 bg-black/20" />
            <div className="bg-white w-88 min-w-[340px] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{logState.empName}</p>
                  <p className="text-[11px] text-gray-400">Log chi tiết · {month}</p>
                </div>
                <button onClick={() => setLogState(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>

              {/* Tab switcher */}
              <div className="flex gap-1 px-4 pt-2 border-b border-gray-100">
                <button
                  onClick={() => setLogTab('data')}
                  className={`px-3 py-2 text-[11px] font-semibold rounded-t-lg transition ${logTab === 'data' ? 'bg-white text-blue-700 border border-b-white border-gray-200' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Dữ liệu
                </button>
                <button
                  onClick={() => {
                    setLogTab('history')
                    if (auditEntries.length === 0) fetchAudit(logState.empId)
                  }}
                  className={`px-3 py-2 text-[11px] font-semibold rounded-t-lg transition ${logTab === 'history' ? 'bg-white text-blue-700 border border-b-white border-gray-200' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Lịch sử thay đổi
                </button>
              </div>

              {logTab === 'data' && (
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {days4log.map(date => {
                  const units = logUnits[date] as number | undefined
                  const kpi   = logKpi[date] as any
                  const deds  = logDeds.filter((d: any) => d.date === date)
                  if (units === undefined && !kpi && deds.length === 0) return null

                  const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })
                  return (
                    <div key={date} className="py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[11px] font-semibold ${isWeekend(date) ? 'text-gray-400' : 'text-gray-700'}`}>{dayLabel}</span>
                        <div className="flex items-center gap-1.5">
                          {units !== undefined && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${attCls(units)}`}>{attLabel(units)} công</span>
                          )}
                        </div>
                      </div>
                      {kpi && kpi.types.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {kpi.types.map((t: string) => <span key={t} className={`px-1.5 py-px rounded text-[9px] font-bold border ${KPI_CONFIG[t as KpiViolationType]?.cls ?? ''}`}>{t}</span>)}
                          {kpi.note && <span className="text-[10px] text-gray-400 ml-1">{kpi.note}</span>}
                        </div>
                      )}
                      {deds.map((d: any) => (
                        <div key={d.id} className={`flex items-center justify-between px-2 py-1 rounded-lg border text-[10px] mt-0.5 ${DED_TYPE_MAP[d.type]?.cls ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                          <span className="font-medium">{DED_TYPE_MAP[d.type]?.label ?? d.type}</span>
                          <span className={DED_STATUS[d.status]?.cls ?? ''}>{DED_STATUS[d.status]?.label ?? d.status}</span>
                          <span className="font-bold">{d.delta > 0 ? '+' : ''}{d.delta}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
                {days4log.every(date => logUnits[date] === undefined && !logKpi[date] && logDeds.filter((d: any) => d.date === date).length === 0) && (
                  <p className="text-center text-xs text-gray-400 py-8">Chưa có dữ liệu trong tháng này</p>
                )}
              </div>
              )}

              {logTab === 'history' && (
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {auditLoading ? (
                  <p className="text-center text-xs text-gray-400 py-8">Đang tải lịch sử...</p>
                ) : auditEntries.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-8">Chưa có thay đổi nào trong tháng</p>
                ) : (
                  auditEntries.map(e => {
                    const c = e.changes ?? {}
                    const when = new Date(e.createdAt).toLocaleString('vi-VN', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })
                    let typeBadge = ''
                    let typeCls = ''
                    if (e.entityType === 'WorkUnit')      { typeBadge = 'Công';    typeCls = 'bg-green-50 text-green-700 border-green-200' }
                    else if (e.entityType === 'OvertimeEntry') { typeBadge = 'Tăng ca'; typeCls = 'bg-orange-50 text-orange-700 border-orange-200' }
                    else if (e.entityType === 'KpiViolation')  { typeBadge = 'KPI';     typeCls = 'bg-rose-50 text-rose-700 border-rose-200' }

                    let summary = ''
                    if (e.action === 'AUTO_FILL') {
                      summary = `Tự động chấm: +${c.created ?? 0} công · +${c.createdLeaveZeroes ?? 0} nghỉ KL · giữ ${c.skippedExisting ?? 0}`
                    } else if (e.action === 'BULK_DELETE') {
                      summary = `Xoá tháng (${c.deleted ?? 0} ngày)`
                    } else if (e.entityType === 'WorkUnit') {
                      const from = c.unitsFrom === null || c.unitsFrom === undefined ? '∅' : String(c.unitsFrom)
                      const to = c.unitsTo === null || c.unitsTo === undefined ? '∅' : String(c.unitsTo)
                      summary = `${c.date ?? ''}: ${from} → ${to} công${c.noteTo ? ' · ' + c.noteTo : ''}`
                    } else if (e.entityType === 'OvertimeEntry') {
                      const from = c.hoursFrom === null || c.hoursFrom === undefined ? '∅' : String(c.hoursFrom) + 'h'
                      const to = c.hoursTo === null || c.hoursTo === undefined ? '∅' : String(c.hoursTo) + 'h'
                      summary = `${c.date ?? ''}: ${from} → ${to}${c.noteTo ? ' · ' + c.noteTo : ''}`
                    } else if (e.entityType === 'KpiViolation') {
                      const from = (c.typesFrom ?? []).join(',') || '∅'
                      const to = (c.typesTo ?? []).join(',') || '∅'
                      summary = `${c.date ?? ''}: [${from}] → [${to}]${c.noteTo ? ' · ' + c.noteTo : ''}`
                    }

                    return (
                      <div key={e.id} className="py-2 border-b border-gray-50 last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${typeCls}`}>
                            {typeBadge} · {e.action}
                          </span>
                          <span className="text-[10px] text-gray-400">{when}</span>
                        </div>
                        <div className="text-[11px] text-gray-700">{summary}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Bởi: <span className="font-semibold">{e.changedByName ?? 'Hệ thống'}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              )}

              <div className="border-t border-gray-200 px-5 py-3 space-y-1.5">
                {([
                  ['Công số nhận', `${(totalUnits as number).toFixed(1)} công`, 'text-green-600'],
                  ['Vi phạm KPI', totalViols > 0 ? `${totalViols} lần` : '—', 'text-rose-600'],
                  ['Điều chỉnh công số (duyệt)', (() => {
                    const v = logDeds.filter((d: any) => d.status === 'APPROVED').reduce((s: number, d: any) => s + d.delta, 0)
                    return v !== 0 ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : '—'
                  })(), 'text-gray-700'],
                ] as [string, string, string][]).map(([label, val, cls]) => (
                  <div key={label} className="flex justify-between text-[11px] text-gray-500">
                    <span>{label}</span>
                    <span className={`font-bold ${cls}`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </PageShell>
  )
}
