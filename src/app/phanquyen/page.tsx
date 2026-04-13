'use client'
import { useState, useEffect, useMemo } from 'react'
import PageShell from '@/components/layout/PageShell'
import { ALL_MODULES, ALL_ACTIONS, CANONICAL_ROLES, normalizeRole } from '@/constants/data'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuth } from '@/components/auth/AuthProvider'
import type { PermissionGroup, UserRole } from '@/types'
import { Shield, ShieldCheck, ShieldAlert, Pencil, Plus, Check, Users, X } from 'lucide-react'

const ROLE_STYLE: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  admin:    { cls: 'bg-red-50 text-red-700 border-red-200',     icon: <ShieldAlert size={12}/>, label: 'Quản trị viên' },
  manager:  { cls: 'bg-blue-50 text-blue-700 border-blue-200',  icon: <ShieldCheck size={12}/>, label: 'Quản lý' },
  employee: { cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: <Shield size={12}/>,      label: 'Nhân viên' },
}

const ACCT_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:     { label: 'Hoạt động',  cls: 'bg-green-50 text-green-700' },
  LOCKED:     { label: 'Khoá',       cls: 'bg-red-50 text-red-700' },
  NO_ACCOUNT: { label: 'Chưa có TK', cls: 'bg-gray-100 text-gray-500' },
}

const ACTION_LABELS: Record<string, string> = { view: 'Xem', edit: 'Sửa', delete: 'Xoá' }

const AVATAR_COLORS = ['bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-amber-600', 'bg-pink-600', 'bg-cyan-600', 'bg-red-500', 'bg-indigo-600']
function getInitials(name: string) {
  const p = (name || '').trim().split(/\s+/)
  return p.length >= 2 ? (p[p.length - 2][0] + p[p.length - 1][0]).toUpperCase() : (name || '').slice(0, 2).toUpperCase()
}
function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function groupHasPerm(g: PermissionGroup, perm: string) {
  return g.permissions.includes('*')
    || g.permissions.includes(perm)
    || g.permissions.includes(perm.split('.')[0] + '.*')
}

export default function PhanQuyenPage() {
  const { employees, mutate: mutateEmps } = useEmployees()
  const { refreshPermissions } = useAuth()
  const [groups, setGroups] = useState<PermissionGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/permission-groups')
      .then(r => r.json())
      .then(data => { setGroups(Array.isArray(data) ? data : []); setGroupsLoading(false) })
      .catch(() => setGroupsLoading(false))
  }, [])

  const [editGroup, setEditGroup] = useState<PermissionGroup | null>(null)
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set())
  const [editEmpId, setEditEmpId] = useState<string | null>(null)
  const [empRole, setEmpRole] = useState<UserRole>('employee')
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupLabel, setNewGroupLabel] = useState('')

  const openGroupEdit = (g: PermissionGroup) => {
    setEditGroup(g)
    setEditPerms(new Set(g.permissions))
  }

  const togglePerm = (perm: string) => {
    setEditPerms(prev => {
      const next = new Set(prev)
      if (next.has(perm)) next.delete(perm)
      else next.add(perm)
      return next
    })
  }

  const toggleWholeModule = (moduleKey: string, on: boolean) => {
    setEditPerms(prev => {
      const next = new Set(prev)
      for (const a of ALL_ACTIONS) {
        const p = `${moduleKey}.${a}`
        if (on) next.add(p)
        else next.delete(p)
      }
      return next
    })
  }

  const saveGroup = async () => {
    if (!editGroup) return
    setSaving(true)
    try {
      const res = await fetch(`/api/permission-groups/${editGroup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: Array.from(editPerms) }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setGroups(prev => prev.map(g => g.id === updated.id ? updated : g))
      setEditGroup(null)
      // Refresh current user's permissions in case they just edited their own group
      await refreshPermissions()
    } catch (e) {
      console.error('saveGroup error:', e)
      alert('Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  const addGroup = async () => {
    if (!newGroupName.trim() || !newGroupLabel.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/permission-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim(), label: newGroupLabel.trim(), permissions: ['dashboard.view'] }),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = await res.json()
      setGroups(prev => [...prev, created])
      setShowAddGroup(false)
      setNewGroupName('')
      setNewGroupLabel('')
    } catch (e) {
      console.error('addGroup error:', e)
      alert('Tạo nhóm thất bại')
    } finally {
      setSaving(false)
    }
  }

  const editEmp = editEmpId ? employees.find((e: any) => e.id === editEmpId) : null

  const openEmpEdit = (emp: any) => {
    setEditEmpId(emp.id)
    setEmpRole(normalizeRole(emp.user?.role ?? 'employee') as UserRole)
  }

  const saveEmpPerms = async () => {
    if (!editEmpId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/employees/${editEmpId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: empRole }),
      })
      if (!res.ok) throw new Error(await res.text())
      await mutateEmps()
      await refreshPermissions()
      setEditEmpId(null)
    } catch (e) {
      console.error('save emp perms error:', e)
      alert('Lưu quyền thất bại')
    } finally {
      setSaving(false)
    }
  }

  const activeAccounts = employees.filter((e: any) => e.accountStatus === 'ACTIVE').length
  const lockedAccounts = employees.filter((e: any) => e.accountStatus === 'LOCKED').length

  // Preview permissions for currently selected role in employee edit modal
  const previewGroup = useMemo(
    () => groups.find(g => g.name === empRole),
    [groups, empRole]
  )

  return (
    <PageShell breadcrumb="Hệ thống" title="Phân quyền">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Nhóm quyền', value: groups.length, icon: <Shield size={16}/>, color: 'text-blue-600 bg-blue-50' },
          { label: 'Tài khoản hoạt động', value: activeAccounts, icon: <ShieldCheck size={16}/>, color: 'text-green-600 bg-green-50' },
          { label: 'Tài khoản bị khoá', value: lockedAccounts, icon: <ShieldAlert size={16}/>, color: 'text-red-600 bg-red-50' },
          { label: 'Tổng nhân viên', value: employees.length, icon: <Users size={16}/>, color: 'text-purple-600 bg-purple-50' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
            <div>
              <div className="text-[11px] text-gray-500">{s.label}</div>
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Permission Groups ═══ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-bold text-gray-900">Nhóm quyền</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Quản lý 3 nhóm vai trò: Quản trị viên / Quản lý / Nhân viên</p>
          </div>
          <button
            onClick={() => setShowAddGroup(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus size={13}/> Thêm nhóm
          </button>
        </div>

        {groupsLoading ? (
          <div className="p-8 text-center text-xs text-gray-400">Đang tải...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-56">Nhóm</th>
                  {ALL_MODULES.map(m => (
                    <th
                      key={m.key}
                      className="text-center px-1.5 py-2.5 font-semibold text-gray-400 text-[10px] whitespace-nowrap"
                    >
                      {m.label}
                    </th>
                  ))}
                  <th className="text-center px-4 py-2.5 font-semibold text-gray-500 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const style = ROLE_STYLE[g.name] || ROLE_STYLE.employee
                  return (
                    <tr key={g.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${style.cls}`}>
                          {style.icon} {g.label}
                        </span>
                        <div className="text-[10px] text-gray-400 mt-0.5">{g.description}</div>
                      </td>
                      {ALL_MODULES.map(m => {
                        const hasView = groupHasPerm(g, `${m.key}.view`)
                        const hasEdit = groupHasPerm(g, `${m.key}.edit`)
                        const hasDelete = groupHasPerm(g, `${m.key}.delete`)
                        return (
                          <td key={m.key} className="text-center px-1.5 py-2.5">
                            {g.permissions.includes('*') ? (
                              <span className="text-green-600 text-[10px] font-bold">ALL</span>
                            ) : hasView ? (
                              <span
                                className={`inline-block w-5 h-5 rounded text-[9px] font-bold leading-5 ${
                                  hasDelete
                                    ? 'bg-red-100 text-red-700'
                                    : hasEdit
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-500'
                                }`}
                                title={[hasView && 'xem', hasEdit && 'sửa', hasDelete && 'xoá'].filter(Boolean).join(' • ')}
                              >
                                {hasDelete ? 'D' : hasEdit ? 'E' : 'V'}
                              </span>
                            ) : (
                              <span className="text-gray-200">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="text-center px-4 py-2.5">
                        <button
                          onClick={() => openGroupEdit(g)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Pencil size={12}/>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[10px] text-gray-500 flex items-center gap-4">
          <span><span className="inline-block w-3 h-3 rounded bg-gray-100 align-middle mr-1"/>V = chỉ xem</span>
          <span><span className="inline-block w-3 h-3 rounded bg-blue-100 align-middle mr-1"/>E = xem + sửa</span>
          <span><span className="inline-block w-3 h-3 rounded bg-red-100 align-middle mr-1"/>D = xem + sửa + xoá</span>
          <span className="text-green-600 font-bold">ALL = toàn quyền</span>
        </div>
      </div>

      {/* ═══ Employee Permissions ═══ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[13px] font-bold text-gray-900">Vai trò nhân viên</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Gán 1 trong 3 vai trò cho mỗi nhân viên</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-10"></th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Nhân viên</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Email đăng nhập</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Vai trò</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Trạng thái TK</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: any) => {
                const normalized = normalizeRole(emp.user?.role ?? 'employee')
                const role = ROLE_STYLE[normalized] || ROLE_STYLE.employee
                const acct = ACCT_STATUS[emp.accountStatus] || ACCT_STATUS.NO_ACCOUNT
                return (
                  <tr key={emp.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                    <td className="px-4 py-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${avatarColor(emp.id)}`}>
                        {getInitials(emp.fullName)}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-900">{emp.fullName}</div>
                      <div className="text-[10px] text-gray-400">{emp.code ?? '—'} · {emp.position || '—'}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600 font-mono text-[11px]">{emp.email || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${role.cls}`}>
                        {role.icon} {role.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${acct.cls}`}>{acct.label}</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => openEmpEdit(emp)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Đổi vai trò"
                      >
                        <Pencil size={12}/>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Group Edit Modal (3-column matrix: view/edit/delete) ═══ */}
      {editGroup && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setEditGroup(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[720px] max-h-[85vh] overflow-y-auto"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Sửa nhóm quyền: {editGroup.label}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{editGroup.description}</p>
              </div>
              <button onClick={() => setEditGroup(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18}/>
              </button>
            </div>
            <div className="p-6">
              {editGroup.permissions.includes('*') ? (
                <div className="text-center py-8 text-sm text-gray-500">
                  <ShieldAlert size={32} className="mx-auto mb-2 text-red-400"/>
                  Nhóm Quản trị viên có toàn quyền. Không thể chỉnh sửa.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500 w-40">Module</th>
                        {ALL_ACTIONS.map(a => (
                          <th key={a} className="text-center px-3 py-2 font-semibold text-gray-500">
                            {ACTION_LABELS[a]}
                          </th>
                        ))}
                        <th className="text-center px-3 py-2 font-semibold text-gray-400 w-20">Toàn bộ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_MODULES.map(m => {
                        const allChecked = ALL_ACTIONS.every(a => editPerms.has(`${m.key}.${a}`))
                        return (
                          <tr key={m.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-3 py-2.5 font-medium text-gray-900">{m.label}</td>
                            {ALL_ACTIONS.map(a => {
                              const perm = `${m.key}.${a}`
                              return (
                                <td key={a} className="text-center px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={editPerms.has(perm)}
                                    onChange={() => togglePerm(perm)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </td>
                              )
                            })}
                            <td className="text-center px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={allChecked}
                                onChange={e => toggleWholeModule(m.key, e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {!editGroup.permissions.includes('*') && (
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onClick={() => setEditGroup(null)}
                  className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  onClick={saveGroup}
                  disabled={saving}
                  className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Check size={13}/> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Add Group Modal ═══ */}
      {showAddGroup && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddGroup(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[400px]"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Thêm nhóm quyền</h3>
              <button onClick={() => setShowAddGroup(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18}/>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Mã nhóm (tiếng Anh, không dấu)</label>
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                  placeholder="vd: supervisor"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Tên hiển thị</label>
                <input
                  value={newGroupLabel}
                  onChange={e => setNewGroupLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                  placeholder="vd: Giám sát viên"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowAddGroup(false)}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Huỷ
              </button>
              <button
                onClick={addGroup}
                disabled={saving}
                className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-60"
              >
                {saving ? 'Đang tạo...' : 'Tạo nhóm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Employee Role Edit Modal (role selector + readonly preview) ═══ */}
      {editEmp && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setEditEmpId(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[640px] max-h-[85vh] overflow-y-auto"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${avatarColor(editEmp.id)}`}>
                {getInitials(editEmp.fullName)}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900">{editEmp.fullName}</h3>
                <p className="text-[11px] text-gray-400">{editEmp.code ?? '—'} · {editEmp.email}</p>
              </div>
              <button onClick={() => setEditEmpId(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18}/>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Role selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Vai trò</label>
                <div className="grid grid-cols-3 gap-2">
                  {CANONICAL_ROLES.map(r => {
                    const style = ROLE_STYLE[r]
                    const selected = empRole === r
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setEmpRole(r as UserRole)}
                        className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border-2 text-xs transition ${
                          selected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${style.cls}`}>
                          {style.icon} {style.label}
                        </span>
                        <span className="text-[10px] text-gray-500 text-center">
                          {r === 'admin' && 'Toàn quyền hệ thống'}
                          {r === 'manager' && 'Quản lý nhân sự + lương'}
                          {r === 'employee' && 'Xem thông tin cá nhân'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Readonly preview of permissions granted by selected role */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Quyền được cấp (xem trước)
                </label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500 w-40">Module</th>
                        {ALL_ACTIONS.map(a => (
                          <th key={a} className="text-center px-3 py-2 font-semibold text-gray-500">
                            {ACTION_LABELS[a]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_MODULES.map(m => (
                        <tr key={m.key} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 font-medium text-gray-800">{m.label}</td>
                          {ALL_ACTIONS.map(a => {
                            const perm = `${m.key}.${a}`
                            const granted = previewGroup ? groupHasPerm(previewGroup, perm) : false
                            return (
                              <td key={a} className="text-center px-3 py-2">
                                {granted ? (
                                  <Check size={14} className="inline text-green-600"/>
                                ) : (
                                  <span className="text-gray-200">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  Muốn thay đổi chi tiết quyền? Sửa trực tiếp ở phần "Nhóm quyền" ở trên.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setEditEmpId(null)}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Huỷ
              </button>
              <button
                onClick={saveEmpPerms}
                disabled={saving}
                className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-1.5 disabled:opacity-60"
              >
                <Check size={13}/> {saving ? 'Đang lưu...' : 'Lưu vai trò'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
