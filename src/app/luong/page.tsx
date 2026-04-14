'use client'
import { useState, useRef } from 'react'
import PageShell from '@/components/layout/PageShell'
import { useAuth } from '@/components/auth/AuthProvider'
import { usePayroll, generatePayroll, updatePayrollStatus, generateMissingPayroll, deletePayroll } from '@/hooks/usePayroll'
import { useEmployees } from '@/hooks/useEmployees'
import { useSalaryColumns } from '@/hooks/useSalaryColumns'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { fmtVND } from '@/lib/format'
import { X, RefreshCw, Plus, Trash2, Download, AlertTriangle, FileText } from 'lucide-react'
import { STATUS_MAP, COL_STYLE, MANUAL_INPUT_MAP } from './_lib/constants'
import { buildRowVars, renderCell } from './_lib/row-helpers'
import PersonalSalaryView from '@/components/payroll/PersonalSalaryView'
import ApprovalHistory from '@/components/payroll/ApprovalHistory'
import SalaryEntriesModal from '@/components/payroll/SalaryEntriesModal'
import StatusModal from './_components/StatusModal'
import SnapshotModal, { type Snapshot } from './_components/SnapshotModal'
// Phase 2 refactor — column labels for the entries-breakdown modal now
// live alongside ENTRY_ALLOWED_COLUMNS in the shared constants module.
// The shared type is narrow (literal union); widen here because the cell
// render loop iterates all salary columns with generic string keys.
import { ENTRY_COLUMN_LABELS } from '@/constants/salary-columns'
const ENTRY_COLUMNS: Record<string, string | undefined> = ENTRY_COLUMN_LABELS

export default function LuongPage() {
  const { user, hasPermission } = useAuth()
  const isManager = user?.role !== 'employee'
  const canEdit   = isManager && hasPermission('luong.edit')

  const defaultMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(defaultMonth)
  const [generating, setGenerating] = useState(false)
  const [generatingMissing, setGeneratingMissing] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)
  const [addEmpOpen, setAddEmpOpen] = useState(false)
  const [addEmpSearch, setAddEmpSearch] = useState('')
  const addEmpRef = useRef<HTMLDivElement>(null)

  const { payrolls, isLoading, mutate } = usePayroll({
    month,
    employeeId: isManager ? undefined : user?.employeeId ?? undefined,
  })
  const { employees: allEmployees, isLoading: empLoading } = useEmployees()

  /* ── Salary columns — SWR so always fresh (auto-updates after config changes) ── */
  const { salaryColumns: allCols } = useSalaryColumns()
  // Show all columns that either map to a payroll field OR have a salaryValue / formula
  // (no hardcoded filter — renders 100% from DB config)
  const salaryColumns = allCols

  /* ── BH/PIT visibility: driven by master toggle from DB (SWR, revalidates on focus) ── */
  const { enableInsuranceTax } = useCompanySettings()
  // Master toggle controls both columns — individual localStorage toggles are ignored
  // to avoid stale config causing columns to hide when the master is ON
  const showBhCols = enableInsuranceTax
  const showPitCol = enableInsuranceTax

  // Totals
  const totalNet   = payrolls.reduce((s: number, p: any) => s + Number(p.netSalary), 0)
  const totalGross = payrolls.reduce((s: number, p: any) => s + Number(p.grossSalary), 0)

  /* ─── Tính lại tất cả ─── */
  async function handleGenerate() {
    setGenerating(true)
    setRecalcMsg(null)
    try {
      const data = await generatePayroll(month)
      setRecalcMsg(`Đã tính lại ${data.succeeded ?? 0} bản lương`)
      await mutate()
    } catch (e: any) {
      console.error('generatePayroll error:', e)
      setRecalcMsg(`Lỗi: ${e.message ?? 'Không thể tính lương'}`)
    } finally {
      setGenerating(false)
      setTimeout(() => setRecalcMsg(null), 3000)
    }
  }

  /* ─── Phase 03: Cập nhật lương ─── */
  async function handleRecalculate() {
    setRecalculating(true)
    setRecalcMsg(null)
    try {
      const res = await fetch('/api/payroll/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRecalcMsg(`Lỗi: ${data.error ?? res.statusText}`)
      } else {
        setRecalcMsg(`Đã cập nhật ${data.updated} bản lương`)
      }
      await mutate()  // always refetch regardless of outcome
    } catch (e: any) {
      console.error('recalculate error:', e)
      setRecalcMsg(`Lỗi kết nối`)
    } finally {
      setRecalculating(false)
      setTimeout(() => setRecalcMsg(null), 3000)
    }
  }

  /* ─── Phase 04: Generate for missing employees ─── */
  async function handleGenerateMissing() {
    setGeneratingMissing(true)
    setRecalcMsg(null)
    try {
      const data = await generateMissingPayroll(month)
      if (data.ok) {
        setRecalcMsg(data.succeeded > 0 ? `Đã tạo ${data.succeeded} bản lương mới` : 'Tất cả nhân viên đã có bảng lương')
        await mutate()
      }
    } catch (e) {
      console.error('generateMissing error:', e)
    } finally {
      setGeneratingMissing(false)
      setTimeout(() => setRecalcMsg(null), 3000)
    }
  }

  /* ─── Phase 04: Add single employee ─── */
  async function handleAddEmployee(employeeId: string) {
    setAddEmpOpen(false)
    setAddEmpSearch('')
    try {
      await generatePayroll(month, [employeeId])
      await mutate()
    } catch (e) {
      console.error('addEmployee error:', e)
    }
  }

  /* ─── Phase 04: Delete DRAFT payroll ─── */
  async function handleDeletePayroll(id: string) {
    try {
      await deletePayroll(id)
      await mutate()
    } catch (e: any) {
      alert(e.message)
    }
  }

  /* ─── Phase 05: Inline manual-input editing ─── */
  type CellEdit = { payrollId: string; colKey: string; raw: number }
  const [cellEdit, setCellEdit] = useState<CellEdit | null>(null)
  const [cellVal, setCellVal] = useState('')
  const [cellSaving, setCellSaving] = useState(false)
  const [cellError, setCellError] = useState<string | null>(null)

  async function saveCellEdit() {
    if (!cellEdit) return
    // Use MANUAL_INPUT_MAP for legacy key aliases; fall back to col.key for custom columns
    const saveKey = MANUAL_INPUT_MAP[cellEdit.colKey] ?? cellEdit.colKey
    if (!saveKey) return
    const num = parseInt(cellVal.replace(/\D/g, ''), 10) || 0
    setCellSaving(true)
    setCellError(null)
    try {
      const res = await fetch('/api/payroll/salary-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollId: cellEdit.payrollId, columnKey: saveKey, month, value: num }),
      })
      if (res.ok) {
        await mutate()
        setCellEdit(null)
      } else {
        const data = await res.json().catch(() => ({}))
        const msg = data?.error ?? `Lỗi ${res.status}`
        setCellError(msg)
        console.error('saveCellEdit API error:', msg, { saveKey, payrollId: cellEdit.payrollId })
        // Keep cell open so user can see the error
      }
    } catch (e) {
      console.error('saveCellEdit network error:', e)
      setCellError('Lỗi kết nối')
    } finally {
      setCellSaving(false)
    }
  }

  function openCellEdit(payrollId: string, colKey: string, raw: number) {
    setCellEdit({ payrollId, colKey, raw })
    setCellVal(String(raw))
  }

  /* ─── Entries modal (line-item breakdown for tien_phu_cap + tien_tru_khac) ─── */
  const [entriesModal, setEntriesModal] = useState<{
    payrollId: string
    columnKey: 'tien_phu_cap' | 'tien_tru_khac'
    label: string
  } | null>(null)

  // Employees not yet in this month's payroll (exclude RESIGNED + deleted only)
  const payrollEmployeeIds = new Set(payrolls.map((p: any) => p.employeeId))
  const availableEmployees = allEmployees
    .filter((e: any) => !payrollEmployeeIds.has(e.id) && e.status !== 'RESIGNED')
    .filter((e: any) => {
      if (!addEmpSearch) return true
      const q = addEmpSearch.toLowerCase()
      return (
        e.fullName?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.code?.toLowerCase().includes(q)
      )
    })

  /* ─── Transition status ─── */
  /* ─── Phase 07b: Snapshot modal ─── */
  const [snapshotModal, setSnapshotModal] = useState<Snapshot | null>(null)
  const [historyModal, setHistoryModal] = useState<string | null>(null)

  const [statusModal, setStatusModal] = useState<{ id: string; name: string; current: string } | null>(null)

  async function handleStatusChange(id: string, status: string) {
    try {
      await updatePayrollStatus(id, status as any)
      await mutate()
    } catch (e) {
      console.error('updatePayrollStatus error:', e)
    }
    setStatusModal(null)
  }

  /* ─── Employee personal view — bypass the admin table entirely ─── */
  if (!isManager) {
    const myPayroll = payrolls[0] ?? null
    return (
      <PageShell breadcrumb="Nhân sự" title="Lương cá nhân">
        <PersonalSalaryView
          payroll={myPayroll as any}
          month={month}
          onMonthChange={setMonth}
          showBhCols={showBhCols}
          showPitCol={showPitCol}
          onConfirm={async (id) => {
            await updatePayrollStatus(id, 'LOCKED' as any)
            await mutate()
          }}
          onReject={async (id, note) => {
            await updatePayrollStatus(id, 'DRAFT' as any, note)
            await mutate()
          }}
        />
      </PageShell>
    )
  }

  return (
    <PageShell breadcrumb="Nhân sự" title="Lương & Thưởng">

      {/* ── Header toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-500">Tháng</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {recalcMsg && (
              <span className="text-[11px] text-green-600 font-medium">{recalcMsg}</span>
            )}
            <button onClick={handleRecalculate} disabled={recalculating}
              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-60">
              <RefreshCw size={12} className={recalculating ? 'animate-spin' : ''} />
              {recalculating ? 'Đang cập nhật...' : 'Cập nhật lương'}
            </button>
            {/* Phase 04: Add employee picker */}
            <div className="relative" ref={addEmpRef}>
              <button onClick={() => setAddEmpOpen(v => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                <Plus size={12} /> Thêm nhân viên
              </button>
              {addEmpOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input autoFocus value={addEmpSearch} onChange={e => setAddEmpSearch(e.target.value)}
                      placeholder="Tìm nhân viên..." className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {empLoading ? (
                      <div className="px-3 py-2 text-[11px] text-gray-400">Đang tải...</div>
                    ) : availableEmployees.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] text-gray-400">
                        {addEmpSearch ? 'Không tìm thấy nhân viên' : 'Tất cả nhân viên đã có bảng lương'}
                      </div>
                    ) : availableEmployees.map((e: any) => (
                      <button key={e.id} onClick={() => handleAddEmployee(e.id)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                        <div className="text-xs font-medium text-gray-900">{e.fullName}</div>
                        <div className="text-[10px] text-gray-400">{e.department} · {e.email}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Phase 04: Generate missing */}
            <button onClick={handleGenerateMissing} disabled={generatingMissing}
              className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-60">
              <Plus size={12} className={generatingMissing ? 'animate-spin' : ''} />
              {generatingMissing ? 'Đang tạo...' : 'Tạo bảng lương tháng này'}
            </button>
            <button onClick={handleGenerate} disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60">
              <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
              {generating ? 'Đang tính...' : 'Tính lại tất cả'}
            </button>
            {/* Phase 09: Excel export */}
            <a href={`/api/export/payroll?month=${month}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
              download>
              <Download size={12} /> Xuất Excel
            </a>
          </div>
        )}
      </div>

      {/* ── Manager: Summary cards ── */}
      {isManager && payrolls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Tổng thực nhận</div>
            <div className="text-2xl font-bold text-blue-600">{fmtVND(totalNet)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">đồng</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Tổng lương gộp</div>
            <div className="text-2xl font-bold text-gray-900">{fmtVND(totalGross)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">đồng</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Số nhân viên</div>
            <div className="text-2xl font-bold text-gray-900">{payrolls.length}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">người</div>
          </div>
        </div>
      )}


      {/* ── Manager: Dynamic Table ── */}
      {isManager && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-12 text-center text-sm text-gray-400">Đang tải...</div>
          ) : payrolls.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="text-sm text-gray-400 mb-3">Chưa có dữ liệu lương tháng {month}</div>
              {canEdit && (
                <button onClick={handleGenerate} disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60">
                  <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
                  {generating ? 'Đang tính...' : 'Tính lương ngay'}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {/* Fixed: Nhân viên */}
                    <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-left sticky left-0 bg-gray-50/60 border-r border-gray-100 min-w-[160px] whitespace-nowrap">
                      Nhân viên
                    </th>
                    {/* Dynamic: salary columns */}
                    {salaryColumns.map(col => (
                      <th key={col.key}
                        className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-right ${
                          col.key === 'tong_thuc_nhan' ? 'text-blue-600' :
                          COL_STYLE[col.key] === 'deduction' ? 'text-red-400' : 'text-gray-400'
                        }`}>
                        {col.name}
                      </th>
                    ))}
                    {/* Fixed: BH NV, Thuế, Status, Actions */}
                    {showBhCols && (
                      <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-right whitespace-nowrap">BH NV</th>
                    )}
                    {showPitCol && (
                      <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-right whitespace-nowrap">Thuế TNCN</th>
                    )}
                    <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-center whitespace-nowrap">Trạng thái</th>
                    <th className="px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.map((p: any) => {
                    const totalBH = Number(p.bhxhEmployee) + Number(p.bhytEmployee) + Number(p.bhtnEmployee)
                    const rowVars = buildRowVars(p, salaryColumns)
                    return (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors">
                        {/* Fixed: Nhân viên */}
                        <td className="sticky left-0 bg-white px-3 py-3 border-r border-gray-100 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-900">{p.employee?.fullName}</span>
                            {/* Phase 09: anomaly icons */}
                            {(() => {
                              const anomalyList: any[] = p.anomalies ?? []
                              const hasError = anomalyList.some((a: any) => a.severity === 'error')
                              const hasWarn  = anomalyList.some((a: any) => a.severity === 'warning')
                              if (!hasError && !hasWarn) return null
                              const title = anomalyList.map((a: any) => a.message).join('\n')
                              return (
                                <span title={title} className={`cursor-help ${hasError ? 'text-red-500' : 'text-amber-500'}`}>
                                  <AlertTriangle size={12} />
                                </span>
                              )
                            })()}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-gray-400">{p.employee?.department}</span>
                            {p.needsRecalc && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">
                                ⟳ Cần cập nhật
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Dynamic: salary columns */}
                        {salaryColumns.map(col => {
                          const raw = rowVars[col.key] ?? 0
                          // Canonical keys in MANUAL_INPUT_MAP are always editable (legacy compat)
                          // Custom columns: editable if type=number AND isEditable=true in DB
                          const isManual = col.type !== 'formula' &&
                            (!!MANUAL_INPUT_MAP[col.key] || col.isEditable === true)
                          const isEditing = cellEdit?.payrollId === p.id && cellEdit?.colKey === col.key
                          const canEditCell = canEdit && p.status === 'DRAFT' && isManual
                          return (
                            <td key={col.key} className="px-3 py-3 text-right">
                              {isEditing ? (
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <input autoFocus type="text" value={cellVal}
                                    onChange={e => { setCellVal(e.target.value); setCellError(null) }}
                                    onBlur={saveCellEdit}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveCellEdit()
                                      if (e.key === 'Escape') { setCellEdit(null); setCellError(null) }
                                    }}
                                    className={`w-28 border rounded px-2 py-0.5 text-right text-xs focus:outline-none focus:ring-1 bg-blue-50 ${cellError ? 'border-red-400 focus:ring-red-400' : 'border-blue-400 focus:ring-blue-400'}`}
                                    disabled={cellSaving}
                                  />
                                  {cellError && (
                                    <span className="text-[9px] text-red-500 max-w-[112px] text-right leading-tight">{cellError}</span>
                                  )}
                                </div>
                              ) : canEditCell && ENTRY_COLUMNS[col.key] ? (
                                <span onClick={() => setEntriesModal({ payrollId: p.id, columnKey: col.key as 'tien_phu_cap' | 'tien_tru_khac', label: ENTRY_COLUMNS[col.key] ?? col.key })}
                                  className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-1 py-0.5 rounded transition-colors inline-block"
                                  title="Click để xem / sửa chi tiết">
                                  {renderCell(col.key, raw)}
                                </span>
                              ) : canEditCell ? (
                                <span onClick={() => { setCellError(null); openCellEdit(p.id, col.key, raw) }}
                                  className="cursor-pointer hover:bg-amber-50 hover:text-amber-700 px-1 py-0.5 rounded transition-colors inline-block"
                                  title="Click để nhập giá trị">
                                  {renderCell(col.key, raw)}
                                </span>
                              ) : (
                                renderCell(col.key, raw)
                              )}
                            </td>
                          )
                        })}
                        {/* Fixed: BH NV, Thuế */}
                        {showBhCols && (
                          <td className="px-3 py-3 text-right text-gray-600">
                            {totalBH > 0 ? fmtVND(totalBH) : <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        {showPitCol && (
                          <td className="px-3 py-3 text-right text-gray-600">
                            {Number(p.pitTax) > 0 ? fmtVND(Number(p.pitTax)) : <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_MAP[p.status]?.cls ?? ''}`}>
                            {STATUS_MAP[p.status]?.label ?? p.status}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {canEdit && p.status !== 'PAID' && (
                              <button onClick={() => setStatusModal({ id: p.id, name: p.employee?.fullName ?? '', current: p.status })}
                                className="text-[10px] text-blue-600 hover:underline whitespace-nowrap">
                                Cập nhật
                              </button>
                            )}
                            {canEdit && p.status === 'DRAFT' && (
                              <button onClick={() => { if (confirm(`Xóa bản lương của ${p.employee?.fullName}?`)) handleDeletePayroll(p.id) }}
                                className="text-red-400 hover:text-red-600 transition-colors" title="Xóa bản lương">
                                <Trash2 size={12} />
                              </button>
                            )}
                            {(p.status === 'LOCKED' || p.status === 'PAID') && p.snapshot && (
                              <button onClick={() => setSnapshotModal(p.snapshot)}
                                className="text-[10px] text-gray-400 hover:text-gray-600 whitespace-nowrap" title="Xem snapshot">
                                📋
                              </button>
                            )}
                            <button onClick={() => setHistoryModal(p.id)}
                              className="text-gray-400 hover:text-blue-600 transition-colors" title="Lịch sử duyệt">
                              <FileText size={12}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {payrolls.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
              <span>{payrolls.length} nhân viên · {month}</span>
              <span>Tổng thực nhận: <span className="font-bold text-blue-600">{fmtVND(totalNet)} đ</span></span>
            </div>
          )}
        </div>
      )}

      {/* ── Status update modal (extracted to _components/StatusModal, Phase 7a) ── */}
      {statusModal && (
        <StatusModal
          state={statusModal}
          onClose={() => setStatusModal(null)}
          onChange={handleStatusChange}
        />
      )}
      {/* ── Snapshot viewer modal (extracted to _components/SnapshotModal, Phase 7b) ── */}
      {snapshotModal && (
        <SnapshotModal
          snapshot={snapshotModal}
          onClose={() => setSnapshotModal(null)}
        />
      )}

      {/* ── Entries breakdown modal (tien_phu_cap / tien_tru_khac) ── */}
      {entriesModal && (
        <SalaryEntriesModal
          payrollId={entriesModal.payrollId}
          columnKey={entriesModal.columnKey}
          columnLabel={entriesModal.label}
          canEdit={!!canEdit}
          onClose={() => setEntriesModal(null)}
          onChanged={() => mutate()}
        />
      )}

      {/* ── Approval history modal ── */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-bold text-gray-900">Lịch sử duyệt</div>
              <button onClick={() => setHistoryModal(null)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
            </div>
            <div className="p-5">
              <ApprovalHistory payrollId={historyModal}/>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
