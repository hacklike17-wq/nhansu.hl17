'use client'
import { useState, useRef, useEffect } from 'react'
import PageShell from '@/components/layout/PageShell'
import { COMPANY_SETTINGS, SYSTEM_CONFIG, DEPARTMENTS } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { useEmployees, createEmployee, updateEmployee, deleteEmployee } from '@/hooks/useEmployees'
import { useSalaryColumns } from '@/hooks/useSalaryColumns'
import { mutate as globalMutate } from 'swr'
import { fmtVND, fmtDate } from '@/lib/format'
import { Building2, Settings, Calculator, Users, Pencil, Trash2, Search, X, Plus, GripVertical, FlaskConical, Check, KeyRound, Shuffle } from 'lucide-react'
import type { SalaryColumn } from '@/types'
import { SYSTEM_VARS } from '@/constants/salary'
import {
  STATUS_BADGE, STATUS_LABEL, CONTRACT_MAP,
  EMPTY_FORM, type EmpForm,
} from './_lib/constants'
import { getInitials, avatarColor, genPassword, toDateStr } from './_lib/helpers'
import { useColumnDragSort } from './_lib/useColumnDragSort'

export default function CaiDatPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const { employees, mutate: mutateEmps } = useEmployees({ search })
  const { salaryColumns, isLoading: colsLoading, mutate: mutateCols } = useSalaryColumns()

  const [tab, setTab] = useState<'company' | 'system' | 'salary' | 'nhansu'>('company')

  /* ── Employee management state ── */
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EmpForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canSeeNhansu = ['admin', 'manager'].includes(user?.role ?? '')
  const isBossAdmin = user?.role === 'admin'
  const canConfig   = user?.role === 'admin'

  /* ── Company settings state ── */
  const [companyForm, setCompanyForm] = useState(COMPANY_SETTINGS)
  const [savedCompany, setSavedCompany] = useState(false)

  /* ── System config state (editable fields only) ── */
  type SysForm = { workHoursPerDay: string; workDaysPerWeek: string; overtimeRate: string; holidayRate: string; leavePerYear: string; currency: string; enableInsuranceTax: boolean; showBhColumns: boolean; showPitColumn: boolean }
  const [sysForm, setSysForm] = useState<SysForm>({
    workHoursPerDay: String(SYSTEM_CONFIG.workHoursPerDay),
    workDaysPerWeek: String(SYSTEM_CONFIG.workDaysPerWeek),
    overtimeRate: String(SYSTEM_CONFIG.overtimeRate),
    holidayRate: String(SYSTEM_CONFIG.holidayRate),
    leavePerYear: String(SYSTEM_CONFIG.leavePerYear),
    currency: SYSTEM_CONFIG.currency,
    enableInsuranceTax: SYSTEM_CONFIG.enableInsuranceTax,
    showBhColumns: SYSTEM_CONFIG.showBhColumns,
    showPitColumn: SYSTEM_CONFIG.showPitColumn,
  })
  const [savedSys, setSavedSys] = useState(false)
  const [savingSys, setSavingSys] = useState(false)

  // Load from localStorage + DB on mount
  useEffect(() => {
    try {
      const rawCompany = localStorage.getItem('hl17_company_settings')
      if (rawCompany) setCompanyForm(JSON.parse(rawCompany))
    } catch { /* ignore */ }
    try {
      const rawSys = localStorage.getItem('hl17_system_config')
      if (rawSys) {
        const s = JSON.parse(rawSys)
        setSysForm(prev => ({
          ...prev,
          ...s,
          enableInsuranceTax: typeof s.enableInsuranceTax === 'boolean' ? s.enableInsuranceTax : true,
          showBhColumns: typeof s.showBhColumns === 'boolean' ? s.showBhColumns : true,
          showPitColumn: typeof s.showPitColumn === 'boolean' ? s.showPitColumn : true,
        }))
      }
    } catch { /* ignore */ }
    // Also fetch DB value for enableInsuranceTax (backend truth)
    fetch('/api/settings/company')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.enableInsuranceTax === 'boolean') {
          setSysForm(prev => ({ ...prev, enableInsuranceTax: data.enableInsuranceTax }))
          localStorage.setItem('hl17_system_config', JSON.stringify({
            ...JSON.parse(localStorage.getItem('hl17_system_config') || '{}'),
            enableInsuranceTax: data.enableInsuranceTax,
          }))
        }
      })
      .catch(() => { /* ignore */ })
  }, [])

  const saveCompany = () => {
    localStorage.setItem('hl17_company_settings', JSON.stringify(companyForm))
    setSavedCompany(true)
    setTimeout(() => setSavedCompany(false), 2000)
  }

  const saveSys = async () => {
    setSavingSys(true)
    // Always persist to localStorage for UI-only settings
    localStorage.setItem('hl17_system_config', JSON.stringify(sysForm))
    // Persist enableInsuranceTax to DB so backend calculation uses it
    try {
      await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enableInsuranceTax: sysForm.enableInsuranceTax }),
      })
      // Invalidate SWR cache so luong page picks up the new value immediately
      await globalMutate('/api/settings/company')
    } catch { /* ignore — localStorage is still written */ }
    setSavingSys(false)
    setSavedSys(true)
    setTimeout(() => setSavedSys(false), 2500)
  }

  /* ── Salary column management state ── */
  type CalcModeVal = 'none' | 'add_to_net' | 'subtract_from_net'
  type ColForm = { name: string; key: string; type: 'number' | 'formula'; formula: string; isEditable: boolean; calcMode: CalcModeVal }
  const EMPTY_COL: ColForm = { name: '', key: '', type: 'number', formula: '', isEditable: true, calcMode: 'none' }
  const [colModalOpen,  setColModalOpen]  = useState(false)
  const [colEditTarget, setColEditTarget] = useState<SalaryColumn | null>(null)
  const [colForm,       setColForm]       = useState<ColForm>(EMPTY_COL)

  const openAddCol = () => { setColEditTarget(null); setColForm(EMPTY_COL); setColError(null); setColModalOpen(true) }
  const openEditCol = (col: SalaryColumn) => {
    setColEditTarget(col)
    setColForm({ name: col.name, key: col.key, type: col.type, formula: col.formula ?? '', isEditable: col.isEditable, calcMode: (col.calcMode as CalcModeVal) ?? 'none' })
    setColError(null)
    setColModalOpen(true)
  }
  const [colSaving,   setColSaving]   = useState(false)
  const [colError,    setColError]    = useState<string | null>(null)
  const [colSuccess,  setColSuccess]  = useState<string | null>(null)
  const formulaInputRef = useRef<HTMLInputElement>(null)

  function insertVar(varKey: string) {
    const el = formulaInputRef.current
    if (!el) {
      setColForm(f => ({ ...f, formula: f.formula + varKey }))
      return
    }
    const s = el.selectionStart ?? el.value.length
    const e = el.selectionEnd   ?? el.value.length
    const next = el.value.slice(0, s) + varKey + el.value.slice(e)
    setColForm(f => ({ ...f, formula: next }))
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(s + varKey.length, s + varKey.length)
    }, 0)
  }

  const saveCol = async () => {
    if (!colForm.name.trim() || !colForm.key.trim()) return
    setColSaving(true)
    setColError(null)
    try {
      if (colEditTarget) {
        const res = await fetch(`/api/salary-columns/${colEditTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            colEditTarget.isSystem
              // system columns: only send calcMode
              ? { calcMode: colForm.calcMode }
              : {
                  name: colForm.name,
                  type: colForm.type,
                  formula: colForm.type === 'formula' ? (colForm.formula || null) : null,
                  isEditable: colForm.isEditable,
                  calcMode: colForm.calcMode,
                }
          ),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const msg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
          setColError(msg || 'Lưu thất bại')
          return
        }
        await mutateCols()
      } else {
        const res = await fetch('/api/salary-columns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: colForm.name,
            key: colForm.key,
            type: colForm.type,
            formula: colForm.type === 'formula' ? (colForm.formula || null) : null,
            isEditable: colForm.isEditable,
            calcMode: colForm.calcMode,
            order: salaryColumns.length,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const msg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
          setColError(msg || 'Lưu thất bại')
          return
        }
        await mutateCols()
      }
      setColModalOpen(false)
      // Show recalculate feedback when calcMode was changed or formula column saved
      const calcModeChanged = colEditTarget && colForm.calcMode !== ((colEditTarget as any).calcMode ?? 'none')
      if (calcModeChanged || colForm.type === 'formula') {
        setColSuccess('Đã lưu. Đang tính lại bảng lương tháng này...')
        setTimeout(() => setColSuccess(null), 4000)
      }
    } catch (e) {
      console.error('saveCol error:', e)
      setColError('Lỗi kết nối, thử lại sau')
    } finally {
      setColSaving(false)
    }
  }

  const deleteCol = async (id: string) => {
    const col = salaryColumns.find(c => c.id === id)
    if (!col) return
    if (!confirm(`Xóa cột "${col.name}"?`)) return
    try {
      const res = await fetch(`/api/salary-columns/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Xóa thất bại')
      }
      await mutateCols()
    } catch (e: any) {
      console.error('deleteCol error:', e)
      alert(e.message ?? 'Xóa thất bại: cột hệ thống không thể xóa')
    }
  }

  /* ── Drag-and-drop for salary column reorder (extracted to useColumnDragSort) ── */
  const {
    draggingId, dragOverId,
    handleDragStart, handleDragEnter, handleDragOver, handleDrop, handleDragEnd,
  } = useColumnDragSort(salaryColumns, mutateCols)

  /* ── Open add modal ── */
  const openAdd = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setModalOpen(true)
  }

  /* ── Open edit modal ── */
  const openEdit = (emp: any) => {
    setEditTarget(emp)
    setForm({
      fullName: emp.fullName,
      email: emp.email,
      phone: emp.phone ?? '',
      dob: toDateStr(emp.dob),
      gender: emp.gender ?? 'male',
      department: emp.department,
      position: emp.position,
      baseSalary: Number(emp.baseSalary),
      responsibilitySalary: Number(emp.responsibilitySalary ?? 0),
      startDate: toDateStr(emp.startDate),
      contractType: emp.contractType ?? 'FULL_TIME',
      address: emp.address ?? '',
      accountStatus: emp.accountStatus ?? 'NO_ACCOUNT',
      accountPassword: '',
    })
    setFormErrors({})
    setModalOpen(true)
  }

  /* ── Save (add or edit) ── */
  const handleSave = async () => {
    const errors: Record<string, string> = {}
    if (!form.fullName.trim()) errors.fullName = 'Bắt buộc'
    if (!form.email.trim()) errors.email = 'Bắt buộc'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email không đúng định dạng'
    if (!form.position.trim()) errors.position = 'Bắt buộc'
    if (!form.startDate) errors.startDate = 'Bắt buộc'
    if (!form.department.trim()) errors.department = 'Bắt buộc'
    if (Object.keys(errors).length) { setFormErrors(errors); return }

    setSaving(true)
    try {
      if (editTarget) {
        await updateEmployee(editTarget.id, form)
      } else {
        await createEmployee(form)
      }
      await mutateEmps()
      setModalOpen(false)
    } catch (e: any) {
      let msg = 'Lưu thất bại. Vui lòng thử lại.'
      try {
        const p = JSON.parse(e.message)
        if (typeof p.error === 'string') {
          msg = p.error
        } else if (p.error?.fieldErrors) {
          // Zod validation error — surface field errors directly
          const fieldErrs: Record<string, string> = {}
          for (const [field, msgs] of Object.entries(p.error.fieldErrors as Record<string, string[]>)) {
            if (msgs?.[0]) fieldErrs[field] = msgs[0]
          }
          if (Object.keys(fieldErrs).length) { setFormErrors(fieldErrs); setSaving(false); return }
          msg = 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại.'
        }
      } catch { /* ignore */ }
      setFormErrors({ _server: msg })
    } finally {
      setSaving(false)
    }
  }

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteEmployee(deleteTarget.id)
      await mutateEmps()
      setDeleteTarget(null)
    } catch (e) {
      console.error('delete employee error:', e)
    } finally {
      setDeleting(false)
    }
  }

  /* ── Account status badge ── */
  const accountBadge = (s: string) => {
    if (s === 'ACTIVE') return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">Hoạt động</span>
    if (s === 'LOCKED') return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Bị khóa</span>
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">Chưa có TK</span>
  }

  return (
    <PageShell breadcrumb="Hệ thống" title="Cài đặt">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 border border-gray-200 rounded-xl p-1 w-fit flex-wrap">
        {([
          ['company', 'Thông tin công ty', <Building2 key="b" size={13}/>],
          ['system', 'Hệ thống', <Settings key="s" size={13}/>],
          ['salary', 'Cấu hình lương', <Calculator key="c" size={13}/>],
          ...(canSeeNhansu ? [['nhansu', 'Quản lý nhân sự', <Users key="u" size={13}/>]] : []),
        ] as [string, string, React.ReactNode][]).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === key ? 'bg-white text-gray-900 font-semibold border border-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Thông tin doanh nghiệp</h3>
          <div className="grid grid-cols-2 gap-4">
            {([
              ['Tên công ty', 'name'],
              ['Mã số thuế', 'taxCode'],
              ['Giám đốc', 'director'],
              ['Ngày thành lập', 'foundedDate'],
              ['Địa chỉ', 'address'],
              ['Điện thoại', 'phone'],
              ['Email', 'email'],
              ['Website', 'website'],
              ['Ngân hàng', 'bankName'],
              ['Số tài khoản', 'bankAccount'],
            ] as [string, keyof typeof companyForm][]).map(([label, field]) => (
              <div key={field}>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
                <input
                  value={companyForm[field] ?? ''}
                  onChange={e => setCompanyForm(prev => ({ ...prev, [field]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          <button
            onClick={saveCompany}
            className={`mt-6 flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg transition-all ${savedCompany ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {savedCompany ? <><Check size={13} /> Đã lưu</> : 'Lưu thay đổi'}
          </button>
        </div>
      )}

      {tab === 'system' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Cấu hình hệ thống</h3>
          <div className="grid grid-cols-2 gap-4">
            {([
              ['Giờ làm/ngày', 'workHoursPerDay'],
              ['Ngày làm/tuần', 'workDaysPerWeek'],
              ['Hệ số OT', 'overtimeRate'],
              ['Hệ số ngày lễ', 'holidayRate'],
              ['Ngày phép/năm', 'leavePerYear'],
              ['Tiền tệ', 'currency'],
            ] as [string, keyof SysForm][]).map(([label, field]) => (
              <div key={field}>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
                <input
                  value={sysForm[field] as string}
                  onChange={e => setSysForm(prev => ({ ...prev, [field]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          {/* ── Bảo hiểm & Thuế ── */}
          <div className="mt-5 border-t border-gray-100 pt-5">
            <h4 className="text-xs font-bold text-gray-700 mb-1">Bảo hiểm &amp; Thuế TNCN</h4>
            <p className="text-[11px] text-gray-400 mb-3">
              Khi <strong>tắt</strong>: không tính BHXH/BHYT/BHTN và Thuế TNCN, ẩn hoàn toàn khỏi bảng lương. Tổng thực nhận được tính lại ngay.
            </p>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setSysForm(prev => ({ ...prev, enableInsuranceTax: !prev.enableInsuranceTax }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${sysForm.enableInsuranceTax ? 'bg-blue-600' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={sysForm.enableInsuranceTax}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${sysForm.enableInsuranceTax ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <span className="text-xs font-medium text-gray-800">
                  Bật tính Bảo hiểm &amp; Thuế TNCN
                </span>
                <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sysForm.enableInsuranceTax ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {sysForm.enableInsuranceTax ? 'BẬT' : 'TẮT'}
                </span>
                <p className="text-[11px] text-gray-400 mt-0.5">BHXH 8% + BHYT 1.5% + BHTN 1% + Thuế TNCN lũy tiến</p>
              </div>
            </label>
          </div>

          <button
            onClick={saveSys}
            disabled={savingSys}
            className={`mt-6 flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-60 ${savedSys ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {savedSys ? <><Check size={13} /> Đã lưu</> : savingSys ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      )}

      {tab === 'salary' && (
        <div className="flex flex-col gap-5">

          {/* ── Dynamic salary columns ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Cột lương động</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Cấu hình các cột hiển thị trong bảng Lương &amp; Thưởng</p>
              </div>
              <div className="flex items-center gap-3">
                {colSuccess && (
                  <span className="text-[11px] text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5">
                    <Check size={11} /> {colSuccess}
                  </span>
                )}
                {canConfig && (
                  <button onClick={openAddCol}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                    <Plus size={12} /> Thêm cột
                  </button>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-6"></th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Tên cột</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Biến (key)</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Loại</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Công thức</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Nhập tay</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Tính vào lương</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Hệ thống</th>
                    {canConfig && <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...salaryColumns].sort((a, b) => a.order - b.order).map(col => (
                    <tr
                      key={col.id}
                      draggable
                      onDragStart={e => handleDragStart(e, col.id)}
                      onDragEnter={e => handleDragEnter(e, col.id)}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors
                        ${draggingId === col.id ? 'opacity-30 bg-blue-50' : ''}
                        ${dragOverId === col.id && draggingId !== col.id ? 'border-t-2 border-t-blue-500 bg-blue-50/40' : ''}`}
                    >
                      <td className="px-3 py-3 text-gray-400 select-none cursor-grab active:cursor-grabbing">
                        <GripVertical size={16} />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{col.name}</td>
                      <td className="px-4 py-3">
                        <code className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">{col.key}</code>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.type === 'formula'
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"><FlaskConical size={9} /> Formula</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Số</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px]">
                        {col.key === 'tong_thuc_nhan'
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-blue-600 bg-blue-50 border border-blue-200 italic whitespace-nowrap">∑ Cộng − Trừ (auto)</span>
                          : col.formula
                          ? <code className="text-[10px] text-gray-500 truncate block">{col.formula}</code>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.isEditable
                          ? <span className="text-green-600 font-semibold">✓</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.key === 'tong_thuc_nhan'
                          ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">Tự tính</span>
                          : (col as any).calcMode === 'add_to_net'
                          ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">+ Cộng</span>
                          : (col as any).calcMode === 'subtract_from_net'
                          ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">– Trừ</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.isSystem
                          ? <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500 font-medium">Hệ thống</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      {canConfig && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditCol(col)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition-colors">
                              <Pencil size={11} /> Sửa
                            </button>
                            <button onClick={() => deleteCol(col.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 size={11} /> Xóa
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Live preview: Tổng thực nhận ── */}
            {(() => {
              const addCols = salaryColumns.filter(c => (c as any).calcMode === 'add_to_net')
              const subCols = salaryColumns.filter(c => (c as any).calcMode === 'subtract_from_net')
              const hasConfig = addCols.length > 0 || subCols.length > 0
              return (
                <div className={`mt-3 px-4 py-3 rounded-xl border text-[11px] ${hasConfig ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  <p className="font-semibold mb-1.5">Tổng thực nhận sẽ được tính:</p>
                  {hasConfig ? (
                    <p className="font-mono leading-relaxed">
                      {addCols.length > 0
                        ? <span className="text-green-700">(+) {addCols.map(c => c.name).join(' + ')}</span>
                        : <span className="text-gray-400">0</span>}
                      {subCols.length > 0 && (
                        <> &nbsp;−&nbsp; <span className="text-red-600">(-) {subCols.map(c => c.name).join(' − ')}</span></>
                      )}
                    </p>
                  ) : (
                    <p>Chưa có cột nào được đặt <strong>Tính vào lương</strong>. Sẽ dùng công thức mặc định: Gross − Bảo hiểm − Thuế.</p>
                  )}
                </div>
              )
            })()}

            <div className="mt-3 text-[11px] text-gray-400 space-y-1">
              <p>Các biến built-in có thể dùng trong công thức:</p>
              <p className="font-mono bg-gray-50 px-3 py-1.5 rounded-lg text-[10px] text-gray-600">
                luong_co_ban · cong_so_nhan · cong_so_tru · net_cong_so · &lt;key của cột khác&gt;
              </p>
            </div>
          </div>

          {/* ── Insurance & Tax (collapsed section) ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Cấu hình bảo hiểm &amp; thuế</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">BHXH (%)</label>
                <input defaultValue={SYSTEM_CONFIG.socialInsuranceRate * 100} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">BHYT (%)</label>
                <input defaultValue={SYSTEM_CONFIG.healthInsuranceRate * 100} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">BHTN (%)</label>
                <input defaultValue={SYSTEM_CONFIG.unemploymentInsuranceRate * 100} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" />
              </div>
            </div>
            <h4 className="text-xs font-bold text-gray-900 mb-3">Bảng thuế TNCN</h4>
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Từ (VND)</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Đến (VND)</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-500">Thuế suất</th>
                </tr>
              </thead>
              <tbody>
                {SYSTEM_CONFIG.taxBrackets.map((b, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-700">{b.from.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2 text-gray-700">{b.to === Infinity ? '∞' : b.to.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2 text-right font-bold text-gray-900">{b.rate * 100}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-6 px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
              Lưu thay đổi
            </button>
          </div>
        </div>
      )}

      {tab === 'nhansu' && canSeeNhansu && (
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhân viên..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={13} /> Thêm nhân viên
            </button>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Nhân viên</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">SĐT / Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Phòng ban / Vị trí</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500">Lương CB</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500">Lương TN</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500">Ngày vào</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500">TK</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
                )}
                {employees.map((emp: any) => (
                  <tr key={emp.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${avatarColor(emp.id)}`}>
                          {getInitials(emp.fullName)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{emp.fullName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-gray-400">{emp.code ?? '—'}</span>
                            {emp.status && (
                              <span className={`inline-flex px-1.5 py-0 rounded-full text-[10px] font-medium border ${STATUS_BADGE[emp.status] ?? ''}`}>
                                {STATUS_LABEL[emp.status] ?? emp.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{emp.phone || '—'}</div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[180px]">{emp.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{emp.position || '—'}</div>
                      <div className="text-[10px] text-gray-400">{emp.department}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtVND(Number(emp.baseSalary))}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-600">
                      {Number(emp.responsibilitySalary) > 0 ? fmtVND(Number(emp.responsibilitySalary)) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-[11px]">{fmtDate(toDateStr(emp.startDate))}</td>
                    <td className="px-4 py-3 text-center">{accountBadge(emp.accountStatus)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => openEdit(emp)}
                          className="flex items-center gap-0.5 px-2 py-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors text-[11px]">
                          <Pencil size={11} /> Sửa
                        </button>
                        <button onClick={() => setDeleteTarget(emp)}
                          className="flex items-center gap-0.5 px-2 py-1 rounded-md text-red-500 hover:bg-red-50 transition-colors text-[11px]">
                          <Trash2 size={11} /> Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 text-[11px] text-gray-400">
              {employees.length} nhân viên
            </div>
          </div>
        </div>
      )}

      {/* ── Salary Column Add/Edit Modal ── */}
      {colModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-gray-900">
                {colEditTarget ? 'Chỉnh sửa cột lương' : 'Thêm cột lương mới'}
              </h2>
              <button onClick={() => setColModalOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4">
              {colError && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-medium">
                  {colError}
                </div>
              )}

              {colEditTarget?.isSystem && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  Cột hệ thống — chỉ có thể cập nhật <strong>Tính vào lương</strong>.
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tên cột <span className="text-red-500">*</span></label>
                <input value={colForm.name} onChange={e => setColForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Thưởng hiệu quả"
                  disabled={!!colEditTarget?.isSystem}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed" />
              </div>

              {!colEditTarget && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tên biến (key) <span className="text-red-500">*</span></label>
                  <input value={colForm.key} onChange={e => setColForm(f => ({ ...f, key: e.target.value.replace(/\s+/g, '_').toLowerCase() }))}
                    placeholder="thuong_hieu_qua"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  <p className="text-[10px] text-gray-400 mt-1">Dùng trong công thức của cột khác. Không thể đổi sau khi tạo.</p>
                </div>
              )}

              {!colEditTarget?.isSystem && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Loại</label>
                  <select
                    value={colForm.type}
                    onChange={e => {
                      const t = e.target.value as 'number' | 'formula'
                      // formula columns can never be manually edited
                      setColForm(f => ({ ...f, type: t, isEditable: t === 'formula' ? false : f.isEditable }))
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="number">Số (nhập tay hoặc tính)</option>
                    <option value="formula">Công thức (tự động tính)</option>
                  </select>
                </div>
              )}

              {colEditTarget?.key !== 'tong_thuc_nhan' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tính vào tổng thực nhận</label>
                  <select value={colForm.calcMode} onChange={e => setColForm(f => ({ ...f, calcMode: e.target.value as CalcModeVal }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="none">Không tính (chỉ hiển thị)</option>
                    <option value="add_to_net">Cộng vào tổng thực nhận</option>
                    <option value="subtract_from_net">Trừ vào tổng thực nhận</option>
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Cột "Cộng" được cộng; "Trừ" bị khấu trừ. Tổng thực nhận tự tính lại.</p>
                </div>
              )}

              {colEditTarget?.key === 'tong_thuc_nhan' && (
                <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-2">
                  <p className="font-semibold">Cột này tự tính — không nhập công thức thủ công.</p>
                  <p className="text-[11px] text-blue-600">Công thức hiện tại:</p>
                  {(() => {
                    const addCols = salaryColumns.filter(c => (c as any).calcMode === 'add_to_net' && c.key !== 'tong_thuc_nhan')
                    const subCols = salaryColumns.filter(c => (c as any).calcMode === 'subtract_from_net')
                    const hasConfig = addCols.length > 0 || subCols.length > 0
                    return hasConfig ? (
                      <p className="font-mono text-[10px] leading-relaxed break-all">
                        {addCols.length > 0
                          ? <span className="text-green-700">{addCols.map(c => c.name).join(' + ')}</span>
                          : '0'}
                        {subCols.length > 0 && (
                          <> − <span className="text-red-600">{subCols.map(c => c.name).join(' − ')}</span></>
                        )}
                      </p>
                    ) : (
                      <p className="text-amber-600 text-[11px]">Chưa có cột nào được đặt Tính vào lương. Sẽ dùng: Gross − BH − Thuế.</p>
                    )
                  })()}
                </div>
              )}

              {colForm.type === 'formula' && colEditTarget?.key !== 'tong_thuc_nhan' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Công thức</label>
                  <input
                    ref={formulaInputRef}
                    value={colForm.formula}
                    onChange={e => setColForm(f => ({ ...f, formula: e.target.value }))}
                    placeholder="net_cong_so * luong_co_ban / 26"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                  {/* Variable picker — system vars */}
                  <div className="mt-2">
                    <p className="text-[10px] text-gray-400 mb-1">Biến hệ thống (click để chèn):</p>
                    <div className="flex flex-wrap gap-1">
                      {SYSTEM_VARS.slice(0, 9).map(v => (
                        <button key={v.key} type="button" onClick={() => insertVar(v.key)}
                          title={v.description}
                          className="px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors font-mono">
                          {v.key}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Custom column vars */}
                  {salaryColumns.filter(c => c.key !== colEditTarget?.key).length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[10px] text-gray-400 mb-1">Cột tùy chỉnh:</p>
                      <div className="flex flex-wrap gap-1">
                        {salaryColumns.filter(c => c.key !== colEditTarget?.key).map(c => (
                          <button key={c.key} type="button" onClick={() => insertVar(c.key)}
                            title={c.name}
                            className="px-2 py-0.5 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100 transition-colors font-mono">
                            {c.key}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {colForm.type === 'number' && !colEditTarget?.isSystem && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={colForm.isEditable}
                    onChange={e => setColForm(f => ({ ...f, isEditable: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600" />
                  <span className="text-xs text-gray-700">Cho phép admin nhập tay giá trị từng tháng</span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
              <button onClick={() => setColModalOpen(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Hủy
              </button>
              <button onClick={saveCol} disabled={colSaving || !colForm.name.trim() || (!colEditTarget && !colForm.key.trim())}
                className="px-5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {colSaving ? 'Đang lưu...' : colEditTarget ? 'Lưu thay đổi' : 'Thêm cột'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Employee Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[620px] max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">{editTarget ? 'Sửa nhân viên' : 'Thêm nhân viên mới'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6">
              {/* Server error banner */}
              {formErrors._server && (
                <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-medium">
                  {formErrors._server}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                {/* Họ tên */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Họ tên <span className="text-red-500">*</span></label>
                  <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${formErrors.fullName ? 'border-red-400' : 'border-gray-200'}`}
                    placeholder="Nguyễn Văn A" />
                  {formErrors.fullName && <span className="text-[10px] text-red-500 mt-0.5 block">{formErrors.fullName}</span>}
                </div>
                {/* Email */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${formErrors.email ? 'border-red-400' : 'border-gray-200'}`}
                    placeholder="email@example.com" />
                  {formErrors.email && <span className="text-[10px] text-red-500 mt-0.5 block">{formErrors.email}</span>}
                </div>
                {/* SĐT */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Số điện thoại</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${formErrors.phone ? 'border-red-400' : 'border-gray-200'}`}
                    placeholder="0901234567" />
                  {formErrors.phone && <span className="text-[10px] text-red-500 mt-0.5 block">{formErrors.phone}</span>}
                </div>
                {/* Ngày sinh */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Ngày sinh</label>
                  <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                {/* Giới tính */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Giới tính</label>
                  <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>
                {/* Phòng ban */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Phòng ban <span className="text-red-500">*</span></label>
                  <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white ${formErrors.department ? 'border-red-400' : 'border-gray-200'}`}>
                    <option value="">— Chọn phòng ban —</option>
                    {DEPARTMENTS.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                  {formErrors.department && <span className="text-[10px] text-red-500 mt-0.5 block">{formErrors.department}</span>}
                </div>
                {/* Chức vụ */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Chức vụ <span className="text-red-500">*</span></label>
                  <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${formErrors.position ? 'border-red-400' : 'border-gray-200'}`}
                    placeholder="Nhân viên, Trưởng phòng..." />
                  {formErrors.position && <span className="text-[10px] text-red-500 mt-0.5 block">{formErrors.position}</span>}
                </div>
                {/* Loại HĐ */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Loại hợp đồng</label>
                  <select value={form.contractType} onChange={e => setForm(f => ({ ...f, contractType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                    <option value="FULL_TIME">Toàn thời gian</option>
                    <option value="PART_TIME">Bán thời gian</option>
                    <option value="INTERN">Thực tập</option>
                    <option value="FREELANCE">Freelance</option>
                  </select>
                </div>
                {/* Ngày vào làm */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Ngày vào làm <span className="text-red-500">*</span></label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${formErrors.startDate ? 'border-red-400' : 'border-gray-200'}`} />
                  {formErrors.startDate && <span className="text-[10px] text-red-500 mt-0.5 block">{formErrors.startDate}</span>}
                </div>
                {/* Lương cơ bản */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Lương cơ bản (VNĐ)</label>
                  <input type="number" min={0} step={100000} value={form.baseSalary}
                    onChange={e => setForm(f => ({ ...f, baseSalary: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    placeholder="8000000" />
                </div>
                {/* Lương trách nhiệm */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Lương trách nhiệm (VNĐ)</label>
                  <input type="number" min={0} step={100000} value={form.responsibilitySalary}
                    onChange={e => setForm(f => ({ ...f, responsibilitySalary: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    placeholder="0" />
                </div>
                {/* Địa chỉ */}
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Địa chỉ</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    placeholder="123 Nguyễn Du, Q.1, TP.HCM" />
                </div>

                {/* ── Account Section ── */}
                <div className="col-span-2 mt-2 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound size={14} className="text-blue-600" />
                    <span className="text-xs font-bold text-gray-900">Thông tin đăng nhập</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                    {/* Account Status */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Trạng thái tài khoản</label>
                      <select value={form.accountStatus} onChange={e => setForm(f => ({ ...f, accountStatus: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                        <option value="ACTIVE">Hoạt động</option>
                        <option value="LOCKED">Khoá</option>
                        <option value="NO_ACCOUNT">Không có tài khoản</option>
                      </select>
                    </div>
                    {/* Account email (display only) */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Tài khoản đăng nhập</label>
                      <input type="text" readOnly value={form.email}
                        className="w-full px-3 py-2 border border-gray-100 rounded-lg text-xs bg-gray-50 text-gray-500 cursor-default"
                        placeholder="(dùng Email ở trên)" />
                      <span className="text-[10px] text-gray-400 mt-0.5 block">Dùng Email làm tài khoản đăng nhập</span>
                    </div>
                    {/* Password */}
                    {form.accountStatus !== 'NO_ACCOUNT' && (
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                          Mật khẩu {editTarget ? '(để trống = giữ nguyên)' : '(để trống = mặc định 123456)'}
                        </label>
                        <div className="flex gap-2">
                          <input type="text" value={form.accountPassword} onChange={e => setForm(f => ({ ...f, accountPassword: e.target.value }))}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-mono"
                            placeholder={editTarget ? 'Để trống nếu không đổi mật khẩu' : 'Để trống = 123456'} />
                          <button type="button" onClick={() => setForm(f => ({ ...f, accountPassword: genPassword() }))}
                            className="px-2.5 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-blue-600 transition-colors" title="Tạo mật khẩu ngẫu nhiên">
                            <Shuffle size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Huỷ
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-1.5 disabled:opacity-60">
                  <Check size={13} />
                  {saving ? 'Đang lưu...' : editTarget ? 'Lưu thay đổi' : 'Thêm nhân viên'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[380px]">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Xác nhận xoá nhân viên</h3>
              <p className="text-xs text-gray-500">
                Bạn có chắc muốn xoá <strong>{deleteTarget.fullName}</strong>? Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors rounded-bl-2xl">
                Huỷ
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors border-l border-gray-100 rounded-br-2xl disabled:opacity-60">
                {deleting ? 'Đang xoá...' : 'Xoá nhân viên'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
