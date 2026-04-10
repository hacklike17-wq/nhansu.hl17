'use client'
import { useState, useRef, useEffect } from 'react'
import PageShell from '@/components/layout/PageShell'
import { DEPARTMENTS, PERMISSION_GROUPS } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { fmtVND, fmtDate } from '@/lib/format'
import type { Employee } from '@/types'
import { Search, Download, Plus, Eye, Pencil, Trash2, X, Check, KeyRound, Shuffle } from 'lucide-react'

/* ─── Constants ─── */
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  working:  { label: 'Đang làm',  cls: 'bg-green-50 text-green-700 border-green-200' },
  half:     { label: 'Nửa ngày',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  leave:    { label: 'Nghỉ phép', cls: 'bg-red-50 text-red-700 border-red-200' },
  remote:   { label: 'Remote',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  resigned: { label: 'Đã nghỉ',   cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const AVATAR_COLORS = ['bg-blue-600','bg-green-600','bg-purple-600','bg-amber-600','bg-pink-600','bg-cyan-600','bg-red-500','bg-indigo-600']

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function avatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function genPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

const EMPTY_FORM: Partial<Employee> = {
  name: '', email: '', phone: '', dob: '', gender: 'male',
  department: 'Hacklike17', departmentId: 'D001', deptColor: 'blue',
  position: '', contractType: 'fulltime', joinDate: '', salary: 0,
  address: '', bankAccount: '--', bankName: '--', taxCode: '--',
  socialInsurance: '--', hours: '--', role: '', status: 'working',
  accountEmail: '', accountPassword: '', accountRole: 'employee',
  accountPermissions: [], accountStatus: 'no_account',
}

/* ─── Inline Edit Cell ─── */
function InlineInput({ value, onSave, type = 'text' }: { value: string; onSave: (v: string) => void; type?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setVal(value) }, [value])

  if (!editing) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-1 -mx-1 rounded transition-colors"
        title="Click để sửa"
      >
        {value || '—'}
      </span>
    )
  }

  const save = () => { onSave(val); setEditing(false) }
  const cancel = () => { setVal(value); setEditing(false) }

  return (
    <input
      ref={ref}
      type={type}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
      onClick={e => e.stopPropagation()}
      className="w-full px-1.5 py-0.5 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
    />
  )
}

function InlineStatus({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLSelectElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const st = STATUS_MAP[value] || STATUS_MAP.working

  if (!editing) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer hover:opacity-80 transition-opacity ${st.cls}`}
        title="Click để đổi trạng thái"
      >
        {st.label}
      </span>
    )
  }

  return (
    <select
      ref={ref}
      value={value}
      onChange={e => { onSave(e.target.value); setEditing(false) }}
      onBlur={() => setEditing(false)}
      onClick={e => e.stopPropagation()}
      className="text-[10px] border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
    >
      {Object.entries(STATUS_MAP).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  )
}

/* ─── Main Page ─── */
export default function NhanVienPage() {
  const { employees, setEmployees } = useAuth()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Form modal (add/edit)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Employee>>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)

  /* ── Helpers ── */
  const updateField = (id: string, field: keyof Employee, value: string | number) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  const filtered = employees.filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.code.toLowerCase().includes(search.toLowerCase()) && !e.email.toLowerCase().includes(search.toLowerCase())) return false
    if (deptFilter && e.departmentId !== deptFilter) return false
    if (statusFilter && e.status !== statusFilter) return false
    return true
  })

  const detail = selectedId ? employees.find(e => e.id === selectedId) : null

  /* ── Form actions ── */
  const openAddForm = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM })
    setFormErrors({})
    setFormOpen(true)
  }

  const openEditForm = (emp: Employee) => {
    setEditingId(emp.id)
    setFormData({ ...emp })
    setFormErrors({})
    setFormOpen(true)
    setSelectedId(null)
  }

  const handleFormChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n })
  }

  const handleSubmit = () => {
    const errors: Record<string, string> = {}
    if (!formData.name?.trim()) errors.name = 'Bắt buộc'
    if (!formData.email?.trim()) errors.email = 'Bắt buộc'
    if (Object.keys(errors).length) { setFormErrors(errors); return }

    if (editingId) {
      setEmployees(prev => prev.map(e => e.id === editingId ? { ...e, ...formData } as Employee : e))
    } else {
      const maxNum = employees.reduce((max, e) => {
        const n = parseInt(e.id.replace('E', ''), 10)
        return n > max ? n : max
      }, 0)
      const newId = `E${String(maxNum + 1).padStart(3, '0')}`
      const newCode = `NV${String(maxNum + 1).padStart(3, '0')}`
      const newEmp: Employee = {
        ...EMPTY_FORM,
        ...formData,
        id: newId,
        code: newCode,
      } as Employee
      setEmployees(prev => [...prev, newEmp])
    }
    setFormOpen(false)
  }

  const handleDelete = () => {
    if (deleteId) {
      setEmployees(prev => prev.filter(e => e.id !== deleteId))
      setDeleteId(null)
    }
  }

  /* ── Stats ── */
  const stats = [
    { label: 'Tổng nhân viên', value: employees.length },
    { label: 'Đang làm việc', value: employees.filter(e => e.status === 'working' || e.status === 'remote').length },
    { label: 'Nghỉ phép', value: employees.filter(e => e.status === 'leave').length },
    { label: 'Phòng ban', value: DEPARTMENTS.length },
  ]

  return (
    <PageShell breadcrumb="Nhân sự" title="Nhân viên">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[11px] text-gray-500 font-medium">{s.label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm theo tên, mã NV, email..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600">
            <option value="">Tất cả phòng ban</option>
            {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600">
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="ml-auto flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Download size={13} /> Xuất Excel
            </button>
            <button onClick={openAddForm} className="flex items-center gap-1.5 px-3 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              <Plus size={13} /> Thêm nhân viên
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-10"></th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Họ tên</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Chức vụ</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">SĐT</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Email</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ngày sinh</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ngày vào</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500 w-24">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors group">
                  {/* Avatar */}
                  <td className="px-4 py-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${avatarColor(emp.id)}`}>
                      {getInitials(emp.name)}
                    </div>
                  </td>
                  {/* Name */}
                  <td className="px-4 py-2">
                    <div className="font-semibold text-gray-900">{emp.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{emp.code}</div>
                  </td>
                  {/* Position */}
                  <td className="px-4 py-2 text-gray-600">{emp.position || '—'}</td>
                  {/* Phone — inline edit */}
                  <td className="px-4 py-2 text-gray-700">
                    <InlineInput value={emp.phone} onSave={v => updateField(emp.id, 'phone', v)} type="tel" />
                  </td>
                  {/* Email — inline edit */}
                  <td className="px-4 py-2 text-gray-600 max-w-[200px]">
                    <InlineInput value={emp.email} onSave={v => updateField(emp.id, 'email', v)} type="email" />
                  </td>
                  {/* Status — inline edit */}
                  <td className="px-4 py-2 text-center">
                    <InlineStatus value={emp.status} onSave={v => updateField(emp.id, 'status', v)} />
                  </td>
                  {/* DOB */}
                  <td className="px-4 py-2 text-gray-500">{fmtDate(emp.dob)}</td>
                  {/* Join date */}
                  <td className="px-4 py-2 text-gray-500">{fmtDate(emp.joinDate)}</td>
                  {/* Actions */}
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setSelectedId(emp.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Xem chi tiết">
                        <Eye size={13} />
                      </button>
                      <button onClick={() => openEditForm(emp)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Sửa">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteId(emp.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xoá">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Không tìm thấy nhân viên nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Hiển thị {filtered.length} / {employees.length} nhân viên</span>
        </div>
      </div>

      {/* ═══ Detail Modal ═══ */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setSelectedId(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[560px] max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0 ${avatarColor(detail.id)}`}>
                {getInitials(detail.name)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-900">{detail.name}</h3>
                <p className="text-[11px] text-gray-400">{detail.code} · {detail.department} · {detail.position || '—'}</p>
              </div>
              <button onClick={() => openEditForm(detail)} className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 font-medium">
                Sửa
              </button>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              {([
                ['Email', detail.email],
                ['Điện thoại', detail.phone],
                ['Chức vụ', detail.position || '—'],
                ['Phòng ban', detail.department],
                ['Ngày sinh', fmtDate(detail.dob)],
                ['Giới tính', detail.gender === 'male' ? 'Nam' : 'Nữ'],
                ['Trạng thái', STATUS_MAP[detail.status]?.label || '—'],
                ['Ngày vào làm', fmtDate(detail.joinDate)],
                ['Loại HĐ', detail.contractType === 'fulltime' ? 'Toàn thời gian' : detail.contractType === 'parttime' ? 'Bán thời gian' : detail.contractType === 'intern' ? 'Thực tập' : 'Freelance'],
                ['Lương cơ bản', detail.salary ? fmtVND(detail.salary) + ' đ' : '—'],
                ['Ngân hàng', detail.bankName],
                ['Số TK', detail.bankAccount],
                ['Mã số thuế', detail.taxCode],
                ['BHXH', detail.socialInsurance],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div className="text-gray-400 font-medium mb-0.5">{label}</div>
                  <div className="text-gray-900 font-medium">{value}</div>
                </div>
              ))}
              <div className="col-span-2">
                <div className="text-gray-400 font-medium mb-0.5">Địa chỉ</div>
                <div className="text-gray-900 font-medium">{detail.address}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Add/Edit Form Modal ═══ */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[620px] max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">{editingId ? 'Sửa nhân viên' : 'Thêm nhân viên mới'}</h3>
              <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                {/* Họ tên */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Họ tên <span className="text-red-500">*</span></label>
                  <input value={formData.name || ''} onChange={e => handleFormChange('name', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${formErrors.name ? 'border-red-400' : 'border-gray-200'}`}
                    placeholder="Nguyễn Văn A" />
                  {formErrors.name && <span className="text-[10px] text-red-500 mt-0.5">{formErrors.name}</span>}
                </div>
                {/* Email */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={formData.email || ''} onChange={e => handleFormChange('email', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${formErrors.email ? 'border-red-400' : 'border-gray-200'}`}
                    placeholder="email@example.com" />
                  {formErrors.email && <span className="text-[10px] text-red-500 mt-0.5">{formErrors.email}</span>}
                </div>
                {/* SĐT */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Số điện thoại</label>
                  <input type="tel" value={formData.phone || ''} onChange={e => handleFormChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    placeholder="0901234567" />
                </div>
                {/* Ngày sinh */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Ngày sinh</label>
                  <input type="date" value={formData.dob || ''} onChange={e => handleFormChange('dob', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                {/* Giới tính */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Giới tính</label>
                  <select value={formData.gender || 'male'} onChange={e => handleFormChange('gender', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>
                {/* Phòng ban */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Phòng ban</label>
                  <select value={formData.departmentId || 'D001'}
                    onChange={e => {
                      const dept = DEPARTMENTS.find(d => d.id === e.target.value)
                      if (dept) handleFormChange('departmentId', dept.id)
                      if (dept) {
                        setFormData(prev => ({ ...prev, departmentId: dept.id, department: dept.name, deptColor: dept.color }))
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                    {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {/* Chức vụ */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Chức vụ</label>
                  <input value={formData.position || ''} onChange={e => handleFormChange('position', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    placeholder="Nhân viên, Trưởng phòng..." />
                </div>
                {/* Loại HĐ */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Loại hợp đồng</label>
                  <select value={formData.contractType || 'fulltime'} onChange={e => handleFormChange('contractType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                    <option value="fulltime">Toàn thời gian</option>
                    <option value="parttime">Bán thời gian</option>
                    <option value="intern">Thực tập</option>
                    <option value="freelance">Freelance</option>
                  </select>
                </div>
                {/* Ngày vào */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Ngày vào làm</label>
                  <input type="date" value={formData.joinDate || ''} onChange={e => handleFormChange('joinDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                {/* Lương */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Lương cơ bản (VNĐ)</label>
                  <input type="number" value={formData.salary || ''} onChange={e => handleFormChange('salary', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    placeholder="8000000" />
                </div>
                {/* Địa chỉ — full width */}
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Địa chỉ</label>
                  <input value={formData.address || ''} onChange={e => handleFormChange('address', e.target.value)}
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
                    {/* Account Email */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Email đăng nhập (Gmail)</label>
                      <input type="email" value={formData.accountEmail || ''} onChange={e => handleFormChange('accountEmail', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        placeholder="nhanvien@gmail.com" />
                    </div>
                    {/* Account Password */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Mật khẩu</label>
                      <div className="flex gap-2">
                        <input type="text" value={formData.accountPassword || ''} onChange={e => handleFormChange('accountPassword', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-mono"
                          placeholder="Mật khẩu" />
                        <button type="button" onClick={() => handleFormChange('accountPassword', genPassword())}
                          className="px-2.5 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-blue-600 transition-colors" title="Tạo mật khẩu ngẫu nhiên">
                          <Shuffle size={13} />
                        </button>
                      </div>
                    </div>
                    {/* Account Role */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Vai trò</label>
                      <select value={formData.accountRole || 'employee'} onChange={e => handleFormChange('accountRole', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                        {PERMISSION_GROUPS.map(g => <option key={g.name} value={g.name}>{g.label}</option>)}
                      </select>
                    </div>
                    {/* Account Status */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Trạng thái tài khoản</label>
                      <select value={formData.accountStatus || 'no_account'} onChange={e => handleFormChange('accountStatus', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                        <option value="active">Hoạt động</option>
                        <option value="locked">Khoá</option>
                        <option value="no_account">Chưa có tài khoản</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setFormOpen(false)} className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Huỷ
                </button>
                <button onClick={handleSubmit} className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-1.5">
                  <Check size={13} />
                  {editingId ? 'Lưu thay đổi' : 'Thêm nhân viên'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Delete Confirm Dialog ═══ */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[380px]">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Xác nhận xoá nhân viên</h3>
              <p className="text-xs text-gray-500">
                Bạn có chắc muốn xoá <strong>{employees.find(e => e.id === deleteId)?.name}</strong>? Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors rounded-bl-2xl">
                Huỷ
              </button>
              <button onClick={handleDelete} className="flex-1 py-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors border-l border-gray-100 rounded-br-2xl">
                Xoá nhân viên
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
