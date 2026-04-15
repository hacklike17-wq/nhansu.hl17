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
import { X, Calendar, Trash2, Sparkles } from 'lucide-react'
import {
  getDays,
  isWeekend,
  dayNum,
  toDateStr,
  attCls,
  attLabel,
  formatUnits,
  KPI_CONFIG,
  KPI_TYPES,
} from './_lib/chamcong-helpers'
import LogDrawer from './_components/LogDrawer'
import CellEditModal from './_components/CellEditModal'
import OtEditModal from './_components/OtEditModal'
import KpiEditModal from './_components/KpiEditModal'

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

  // Manager-only: filter display to a single employee (purely UI — does not
  // affect any save/calc logic, just narrows which rows the 3 tables render).
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null)

  // Filter targets
  const targets = useMemo(() => {
    const base = isManager
      ? employees.filter((e: any) => e.accountStatus !== 'NO_ACCOUNT')
      : employees.filter((e: any) => e.id === user?.employeeId)
    if (isManager && filterEmployeeId) {
      return base.filter((e: any) => e.id === filterEmployeeId)
    }
    return base
  }, [isManager, employees, user, filterEmployeeId])

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
  // Modal form state (val, note) moved into CellEditModal (Phase 6b). Parent
  // now stores the initial seed values alongside the cell identity so they
  // only need to be computed once — at openAttEdit time.
  type AttEdit = {
    empId: string
    empName: string
    date: string
    initialVal: number
    initialNote: string
  }
  const [attEdit, setAttEdit] = useState<AttEdit | null>(null)
  const [saving, setSaving] = useState(false)

  function openAttEdit(empId: string, empName: string, date: string) {
    if (!isManager) return
    const existing = attMap[`${empId}|${date}`]
    setSaveError(null)
    setAttEdit({
      empId,
      empName,
      date,
      initialVal: existing?.units ?? 1.0,
      initialNote: existing?.note ?? '',
    })
  }
  async function saveAtt(val: number, note: string) {
    if (!attEdit) return
    setSaving(true)
    setSaveError(null)
    try {
      await upsertWorkUnit({
        employeeId: attEdit.empId,
        date: attEdit.date,
        units: val,
        note: note.trim() || undefined,
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
  // Form state (hours, note) moved into OtEditModal (Phase 6d). Parent
  // carries the initial seed values alongside the cell identity.
  type OtEdit = {
    empId: string
    empName: string
    date: string
    initialHours: number
    initialNote: string
  }
  const [otEdit, setOtEdit] = useState<OtEdit | null>(null)
  const [otSaving, setOtSaving] = useState(false)

  function openOtEdit(empId: string, empName: string, date: string) {
    if (!isManager) return
    const existing = otMap[`${empId}|${date}`]
    setSaveError(null)
    setOtEdit({
      empId,
      empName,
      date,
      initialHours: existing?.hours ?? 0,
      initialNote: existing?.note ?? '',
    })
  }
  async function saveOt(hours: number, note: string) {
    if (!otEdit) return
    setOtSaving(true)
    setSaveError(null)
    try {
      await upsertOvertimeEntry({ employeeId: otEdit.empId, date: otEdit.date, hours, note })
      await mutateOT()
      setOtEdit(null)
    } catch (e: any) {
      setSaveError(formatSaveError(e, otEdit.empName, otEdit.date))
    } finally {
      setOtSaving(false)
    }
  }

  /* ══════════════ TABLE 3: KPI ══════════════ */
  // Form state (selected types, note) moved into KpiEditModal (Phase 6c).
  // Parent carries the initial seed values so the modal can mount with the
  // existing violation pre-selected.
  type KpiEdit = {
    empId: string
    empName: string
    date: string
    initialTypes: KpiViolationType[]
    initialNote: string
  }
  const [kpiEdit, setKpiEdit] = useState<KpiEdit | null>(null)

  function openKpiEdit(empId: string, empName: string, date: string) {
    if (!isManager) return
    const existing = kpiMap[`${empId}|${date}`]
    setSaveError(null)
    setKpiEdit({
      empId,
      empName,
      date,
      initialTypes: existing?.types ?? [],
      initialNote: existing?.note ?? '',
    })
  }
  async function saveKpi(types: KpiViolationType[], note: string) {
    if (!kpiEdit) return
    setSaveError(null)
    try {
      await upsertKpiViolation({ employeeId: kpiEdit.empId, date: kpiEdit.date, types, note })
      await mutateKpi()
      setKpiEdit(null)
    } catch (e: any) {
      setSaveError(formatSaveError(e, kpiEdit.empName, kpiEdit.date))
    }
  }

  /* ══════════════ LOG DRAWER ══════════════ */
  // Drawer internals (tab, audit list, loading) live inside LogDrawer itself
  // (Phase 6a extraction). The parent only owns which employee the drawer
  // is currently open for.
  type LogState = { empId: string; empName: string }
  const [logState, setLogState] = useState<LogState | null>(null)

  function openLogDrawer(empId: string, empName: string) {
    setLogState({ empId, empName })
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
        {isManager && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-400">Nhân viên</label>
            <div className="relative">
              <select
                value={filterEmployeeId ?? ''}
                onChange={e => setFilterEmployeeId(e.target.value || null)}
                className="border border-gray-200 rounded-lg pl-2.5 pr-7 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 h-8 max-w-[200px] truncate bg-white appearance-none cursor-pointer"
              >
                <option value="">Tất cả ({employees.filter((e: any) => e.accountStatus !== 'NO_ACCOUNT').length})</option>
                {employees
                  .filter((e: any) => e.accountStatus !== 'NO_ACCOUNT')
                  .sort((a: any, b: any) => a.fullName.localeCompare(b.fullName))
                  .map((e: any) => (
                    <option key={e.id} value={e.id}>{e.fullName}{e.department ? ` — ${e.department}` : ''}</option>
                  ))}
              </select>
              <svg
                className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {filterEmployeeId && (
              <button
                onClick={() => setFilterEmployeeId(null)}
                className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-100"
                title="Bỏ lọc"
              >
                <X size={11} /> Bỏ lọc
              </button>
            )}
          </div>
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
                        {formatUnits(total)}
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

      {/* MODAL: EDIT CÔNG SỐ — extracted to _components/CellEditModal (Phase 6b) */}
      {attEdit && (
        <CellEditModal
          empName={attEdit.empName}
          date={attEdit.date}
          initialVal={attEdit.initialVal}
          initialNote={attEdit.initialNote}
          saving={saving}
          saveError={saveError}
          onClose={() => { setAttEdit(null); setSaveError(null) }}
          onSave={saveAtt}
        />
      )}

      {/* MODAL: EDIT TĂNG CA — extracted to _components/OtEditModal (Phase 6d) */}
      {otEdit && (
        <OtEditModal
          empName={otEdit.empName}
          date={otEdit.date}
          initialHours={otEdit.initialHours}
          initialNote={otEdit.initialNote}
          saving={otSaving}
          saveError={saveError}
          onClose={() => { setOtEdit(null); setSaveError(null) }}
          onSave={saveOt}
        />
      )}

      {/* MODAL: EDIT KPI — extracted to _components/KpiEditModal (Phase 6c) */}
      {kpiEdit && (
        <KpiEditModal
          empName={kpiEdit.empName}
          date={kpiEdit.date}
          initialTypes={kpiEdit.initialTypes}
          initialNote={kpiEdit.initialNote}
          saveError={saveError}
          onClose={() => { setKpiEdit(null); setSaveError(null) }}
          onSave={saveKpi}
        />
      )}

      {/* LOG DRAWER — extracted to _components/LogDrawer.tsx (Phase 6a) */}
      {logState && (
        <LogDrawer
          empId={logState.empId}
          empName={logState.empName}
          month={month}
          attendance={attendance}
          deductions={deductions}
          kpiViolations={kpiViolations}
          onClose={() => setLogState(null)}
        />
      )}
    </PageShell>
  )
}
