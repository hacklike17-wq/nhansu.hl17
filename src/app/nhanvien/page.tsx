'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { DEPARTMENTS } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import { useEmployees } from '@/hooks/useEmployees'
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

/* ─── Employee Self-Profile ─── */
function EmployeeSelfProfile({ empId }: { empId: string }) {
  const { employees } = useEmployees()
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
  const [showFieldPicker, setShowFieldPicker] = useState(false)

  const toggleField = (key: string) => {
    setVisibleFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowFieldPicker(v => !v)}
          className="px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium"
        >
          Tuỳ chỉnh hiển thị
        </button>
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
            {ALL_FIELDS.filter(f => visibleFields.has(f.key)).map(f => (
              <div key={f.key}>
                <div className="text-xs text-gray-400 mb-0.5">{f.label}</div>
                <div className="text-sm font-medium text-gray-900">{renderValue(f.key, emp[f.key])}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  )
}

/* ─── Main Page ─── */
export default function NhanVienPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { employees, isLoading } = useEmployees({ search, department: deptFilter })

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
          <div className="ml-auto">
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Download size={13} /> Xuất Excel
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
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
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
                  <td className="px-4 py-2">
                    <div className="font-semibold text-gray-900">{emp.fullName}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{emp.code ?? '—'}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{emp.position || '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{emp.phone || '—'}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate">{emp.email || '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_MAP[emp.status]?.cls ?? ''}`}>
                      {STATUS_MAP[emp.status]?.label ?? emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{fmtDate(toDateStr(emp.dob))}</td>
                  <td className="px-4 py-2 text-gray-500">{fmtDate(toDateStr(emp.startDate))}</td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Không tìm thấy nhân viên nào</td></tr>
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
