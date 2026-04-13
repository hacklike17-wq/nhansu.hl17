'use client'
import { useState, useEffect } from 'react'
import PageShell from '@/components/layout/PageShell'
import { DEPARTMENTS } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { useEmployees, updateEmployee } from '@/hooks/useEmployees'
import { fmtVND, fmtDate } from '@/lib/format'
import { Search, Download, Lock } from 'lucide-react'

/* ─── Constants ─── */
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  WORKING:  { label: 'Đang làm',  cls: 'bg-green-50 text-green-700 border-green-200' },
  HALF:     { label: 'Nửa ngày',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  LEAVE:    { label: 'Nghỉ phép', cls: 'bg-red-50 text-red-700 border-red-200' },
  REMOTE:   { label: 'Remote',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  RESIGNED: { label: 'Đã nghỉ',   cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const CONTRACT_MAP: Record<string, string> = {
  FULL_TIME: 'Toàn thời gian',
  PART_TIME: 'Bán thời gian',
  INTERN:    'Thực tập',
  FREELANCE: 'Freelance',
}

const AVATAR_COLORS = ['bg-blue-600','bg-green-600','bg-purple-600','bg-amber-600','bg-pink-600','bg-cyan-600','bg-red-500','bg-indigo-600']

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val).slice(0, 10)
}

function getInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name || '').slice(0, 2).toUpperCase()
}

function avatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/* ─── Visible-fields persistence (shared) ─── */
const SELF_STORAGE_KEY = 'nhansu.self-visible-fields'
const LIST_STORAGE_KEY = 'nhansu.list-visible-cols'

function loadVisible(key: string, defaults: string[]): Set<string> {
  if (typeof window === 'undefined') return new Set(defaults)
  try {
    const raw = localStorage.getItem(key)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {}
  return new Set(defaults)
}

function saveVisible(key: string, set: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {}
}

/* ─── Employee Self-Profile ─── */
const SELF_EDITABLE_KEYS = new Set(['fullName', 'phone', 'gender', 'address', 'bankName', 'bankAccount'])

function EmployeeSelfProfile({ empId }: { empId: string }) {
  const { employees, mutate } = useEmployees()
  const emp = employees.find((e: any) => e.id === empId)

  const ALL_FIELDS: { key: string; label: string; sensitive?: boolean }[] = [
    { key: 'fullName',    label: 'Họ tên' },
    { key: 'email',       label: 'Email' },
    { key: 'phone',       label: 'Số điện thoại' },
    { key: 'dob',         label: 'Ngày sinh' },
    { key: 'gender',      label: 'Giới tính' },
    { key: 'address',     label: 'Địa chỉ' },
    { key: 'department',  label: 'Phòng ban' },
    { key: 'position',    label: 'Vị trí' },
    { key: 'startDate',   label: 'Ngày vào làm' },
    { key: 'contractType',label: 'Loại hợp đồng' },
    { key: 'bankAccount', label: 'Số tài khoản', sensitive: true },
    { key: 'bankName',    label: 'Ngân hàng', sensitive: true },
    { key: 'taxCode',     label: 'Mã số thuế', sensitive: true },
    { key: 'bhxhCode',    label: 'Bảo hiểm XH', sensitive: true },
  ]

  const [visibleFields, setVisibleFields] = useState<Set<string>>(
    () => new Set(ALL_FIELDS.filter(f => !f.sensitive).map(f => f.key))
  )
  useEffect(() => {
    setVisibleFields(
      loadVisible(SELF_STORAGE_KEY, ALL_FIELDS.filter(f => !f.sensitive).map(f => f.key))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [showFieldPicker, setShowFieldPicker] = useState(false)

  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const toggleField = (key: string) => {
    setVisibleFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveVisible(SELF_STORAGE_KEY, next)
      return next
    })
  }

  const startEdit = () => {
    if (!emp) return
    setDraft({
      fullName:    emp.fullName    ?? '',
      phone:       emp.phone       ?? '',
      gender:      emp.gender      ?? '',
      address:     emp.address     ?? '',
      bankName:    emp.bankName    ?? '',
      bankAccount: emp.bankAccount ?? '',
    })
    setSaveError(null)
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setDraft({})
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!emp) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const key of SELF_EDITABLE_KEYS) {
        if (draft[key] !== undefined) payload[key] = draft[key]
      }
      await updateEmployee(empId, payload)
      await mutate()
      setEditMode(false)
    } catch (e: any) {
      let msg = 'Lỗi khi lưu hồ sơ'
      try {
        const parsed = JSON.parse(e?.message ?? '{}')
        if (typeof parsed?.error === 'string') msg = parsed.error
      } catch {}
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!emp) return <div className="p-8 text-gray-500 text-sm">Không tìm thấy thông tin nhân viên.</div>

  function renderValue(key: string, value: unknown): string {
    if (value === undefined || value === null || value === '') return '—'
    if (key === 'gender') return value === 'male' ? 'Nam' : 'Nữ'
    if (key === 'contractType') return CONTRACT_MAP[value as string] ?? String(value)
    if (key === 'dob' || key === 'startDate') return fmtDate(toDateStr(value as string)) || '—'
    return String(value)
  }

  const initials = getInitials(emp.fullName)

  return (
    <PageShell breadcrumb="Nhân sự" title="Hồ sơ của tôi">
      <div className="flex justify-end mb-4 gap-2">
        <button
          onClick={() => setShowFieldPicker(v => !v)}
          className="px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium"
        >
          Tuỳ chỉnh hiển thị
        </button>
        {editMode ? (
          <>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        ) : (
          <button
            onClick={startEdit}
            className="px-3 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-medium"
          >
            Chỉnh sửa
          </button>
        )}
      </div>

      {showFieldPicker && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Chọn trường hiển thị</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {ALL_FIELDS.map(f => (
              <label key={f.key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={visibleFields.has(f.key)}
                  onChange={() => toggleField(f.key)}
                  className="rounded"
                />
                <span>{f.label}</span>
                {f.sensitive && <Lock size={11} className="text-gray-400" />}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
        <div className="md:w-1/3 flex flex-col items-center text-center gap-3 pt-2">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-base font-bold text-gray-900">{emp.fullName}</div>
            {emp.position && <div className="text-xs text-gray-500 mt-0.5">{emp.position}</div>}
            {emp.department && (
              <span className="inline-flex mt-2 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {emp.department}
              </span>
            )}
          </div>
        </div>

        <div className="md:w-2/3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {ALL_FIELDS.filter(f => visibleFields.has(f.key)).map(f => {
              const canEdit = editMode && SELF_EDITABLE_KEYS.has(f.key)
              const adminOnly = editMode && !SELF_EDITABLE_KEYS.has(f.key)
              return (
                <div key={f.key}>
                  <div className="text-xs text-gray-400 mb-0.5 flex items-center gap-1">
                    <span>{f.label}</span>
                    {adminOnly && <Lock size={10} className="text-gray-300" />}
                  </div>
                  {canEdit ? (
                    f.key === 'gender' ? (
                      <select
                        value={draft.gender ?? ''}
                        onChange={e => setDraft(d => ({ ...d, gender: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      >
                        <option value="">—</option>
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                      </select>
                    ) : f.key === 'address' ? (
                      <textarea
                        value={draft.address ?? ''}
                        onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
                        rows={2}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    ) : (
                      <input
                        type="text"
                        value={draft[f.key] ?? ''}
                        onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    )
                  ) : (
                    <div className="text-sm font-medium text-gray-900">{renderValue(f.key, emp[f.key])}</div>
                  )}
                </div>
              )
            })}
          </div>
          {saveError && (
            <div className="mt-4 text-xs text-red-600">{saveError}</div>
          )}
        </div>
      </div>
    </PageShell>
  )
}

/* ─── List columns (manager/admin view) ─── */
type ListColumn = {
  key: string
  label: string
  required?: boolean
  render: (emp: any) => React.ReactNode
}

const LIST_COLUMNS: ListColumn[] = [
  {
    key: 'fullName',
    label: 'Họ tên',
    required: true,
    render: (emp) => (
      <>
        <div className="font-semibold text-gray-900">{emp.fullName}</div>
        <div className="text-[10px] text-gray-400 font-mono">{emp.code ?? '—'}</div>
      </>
    ),
  },
  { key: 'position',     label: 'Chức vụ',    render: (emp) => emp.position || '—' },
  { key: 'department',   label: 'Phòng ban',  render: (emp) => emp.department || '—' },
  { key: 'phone',        label: 'SĐT',        render: (emp) => emp.phone || '—' },
  { key: 'email',        label: 'Email',      render: (emp) => <span className="block max-w-[200px] truncate">{emp.email || '—'}</span> },
  {
    key: 'status',
    label: 'Trạng thái',
    render: (emp) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_MAP[emp.status]?.cls ?? ''}`}>
        {STATUS_MAP[emp.status]?.label ?? emp.status}
      </span>
    ),
  },
  { key: 'startDate',    label: 'Ngày vào',    render: (emp) => fmtDate(toDateStr(emp.startDate)) },
  { key: 'dob',          label: 'Ngày sinh',   render: (emp) => fmtDate(toDateStr(emp.dob)) },
  { key: 'gender',       label: 'Giới tính',   render: (emp) => !emp.gender ? '—' : emp.gender === 'male' ? 'Nam' : 'Nữ' },
  { key: 'contractType', label: 'Loại HĐ',     render: (emp) => CONTRACT_MAP[emp.contractType] ?? emp.contractType ?? '—' },
  { key: 'address',      label: 'Địa chỉ',     render: (emp) => <span className="block max-w-[220px] truncate">{emp.address || '—'}</span> },
  { key: 'bankAccount',  label: 'Số TK',       render: (emp) => emp.bankAccount || '—' },
  { key: 'bankName',     label: 'Ngân hàng',   render: (emp) => emp.bankName || '—' },
  { key: 'taxCode',      label: 'MST',         render: (emp) => emp.taxCode || '—' },
  { key: 'bhxhCode',     label: 'BHXH',        render: (emp) => emp.bhxhCode || '—' },
  { key: 'baseSalary',   label: 'Lương CB',    render: (emp) => emp.baseSalary ? fmtVND(Number(emp.baseSalary)) + ' đ' : '—' },
]

const DEFAULT_LIST_VISIBLE = ['fullName', 'position', 'department', 'phone', 'email', 'status', 'startDate']

/* ─── Main Page ─── */
export default function NhanVienPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { employees, isLoading } = useEmployees({ search, department: deptFilter })

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Column visibility (persistent via localStorage).
  // Init with defaults (matches server HTML), then hydrate from localStorage
  // after mount to avoid SSR/CSR mismatch.
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(DEFAULT_LIST_VISIBLE)
  )
  useEffect(() => {
    setVisibleCols(loadVisible(LIST_STORAGE_KEY, DEFAULT_LIST_VISIBLE))
  }, [])
  const [showColPicker, setShowColPicker] = useState(false)

  const toggleCol = (key: string) => {
    const col = LIST_COLUMNS.find(c => c.key === key)
    if (col?.required) return
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveVisible(LIST_STORAGE_KEY, next)
      return next
    })
  }

  /* ── Employee self-profile early return ── */
  if (user?.role === 'employee') {
    return <EmployeeSelfProfile empId={user.employeeId ?? ''} />
  }

  /* ── Helpers ── */
  const filtered = employees.filter((e: any) => {
    if (statusFilter && e.status !== statusFilter) return false
    return true
  })

  const detail = selectedId ? employees.find((e: any) => e.id === selectedId) : null

  /* ── Stats ── */
  const stats = [
    { label: 'Tổng nhân viên', value: employees.length },
    { label: 'Đang làm việc', value: employees.filter((e: any) => e.status === 'WORKING' || e.status === 'REMOTE').length },
    { label: 'Nghỉ phép', value: employees.filter((e: any) => e.status === 'LEAVE').length },
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
            {DEPARTMENTS.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600">
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowColPicker(v => !v)}
              className="px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium"
            >
              Tuỳ chỉnh hiển thị
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Download size={13} /> Xuất Excel
            </button>
          </div>
        </div>

        {/* Column picker */}
        {showColPicker && (
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/40">
            <div className="text-xs font-semibold text-gray-700 mb-2">Chọn cột hiển thị</div>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {LIST_COLUMNS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visibleCols.has(c.key)}
                    onChange={() => toggleCol(c.key)}
                    disabled={c.required}
                    className="rounded"
                  />
                  <span className={c.required ? 'text-gray-400' : ''}>{c.label}</span>
                  {c.required && <Lock size={11} className="text-gray-400" />}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-10"></th>
                {LIST_COLUMNS.filter(c => visibleCols.has(c.key)).map(c => (
                  <th key={c.key} className="text-left px-4 py-2.5 font-semibold text-gray-500">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={visibleCols.size + 1} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
              ) : filtered.map((emp: any) => (
                <tr
                  key={emp.id}
                  onClick={() => setSelectedId(emp.id)}
                  className="border-b border-gray-50 transition-colors cursor-pointer hover:bg-blue-50/30"
                >
                  <td className="px-4 py-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${avatarColor(emp.id)}`}>
                      {getInitials(emp.fullName)}
                    </div>
                  </td>
                  {LIST_COLUMNS.filter(c => visibleCols.has(c.key)).map(c => (
                    <td key={c.key} className="px-4 py-2 text-gray-700">{c.render(emp)}</td>
                  ))}
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={visibleCols.size + 1} className="px-4 py-8 text-center text-gray-400">Không tìm thấy nhân viên nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Hiển thị {filtered.length} / {employees.length} nhân viên</span>
        </div>
      </div>

      {/* ═══ Detail Modal (view-only) ═══ */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setSelectedId(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[560px] max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0 ${avatarColor(detail.id)}`}>
                {getInitials(detail.fullName)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-900">{detail.fullName}</h3>
                <p className="text-[11px] text-gray-400">{detail.code ?? '—'} · {detail.department} · {detail.position || '—'}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              {([
                ['Email', detail.email],
                ['Điện thoại', detail.phone || '—'],
                ['Chức vụ', detail.position || '—'],
                ['Phòng ban', detail.department],
                ['Ngày sinh', fmtDate(toDateStr(detail.dob))],
                ['Giới tính', detail.gender === 'male' ? 'Nam' : 'Nữ'],
                ['Trạng thái', STATUS_MAP[detail.status]?.label || '—'],
                ['Ngày vào làm', fmtDate(toDateStr(detail.startDate))],
                ['Loại HĐ', CONTRACT_MAP[detail.contractType] ?? detail.contractType],
                ['Lương cơ bản', detail.baseSalary ? fmtVND(Number(detail.baseSalary)) + ' đ' : '—'],
                ['Ngân hàng', detail.bankName || '—'],
                ['Số TK', detail.bankAccount || '—'],
                ['Mã số thuế', detail.taxCode || '—'],
                ['BHXH', detail.bhxhCode || '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div className="text-gray-400 font-medium mb-0.5">{label}</div>
                  <div className="text-gray-900 font-medium">{value}</div>
                </div>
              ))}
              <div className="col-span-2">
                <div className="text-gray-400 font-medium mb-0.5">Địa chỉ</div>
                <div className="text-gray-900 font-medium">{detail.address || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
