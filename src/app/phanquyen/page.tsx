'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { ALL_MODULES, ALL_ACTIONS } from '@/constants/data'
import { useAuth } from '@/components/auth/AuthProvider'
import type { PermissionGroup, Employee, UserRole } from '@/types'
import { Shield, ShieldCheck, ShieldAlert, Pencil, Plus, Check, X, Users, Eye } from 'lucide-react'

/* ─── Constants ─── */
const ROLE_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
  boss_admin: { cls: 'bg-red-50 text-red-700 border-red-200',       icon: <ShieldAlert size={12}/> },
  admin:      { cls: 'bg-blue-50 text-blue-700 border-blue-200',     icon: <ShieldCheck size={12}/> },
  hr_manager: { cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: <Shield size={12}/> },
  accountant: { cls: 'bg-green-50 text-green-700 border-green-200',  icon: <Shield size={12}/> },
  employee:   { cls: 'bg-gray-100 text-gray-600 border-gray-200',    icon: <Shield size={12}/> },
}

const ACCT_STATUS: Record<string, { label: string; cls: string }> = {
  active:     { label: 'Hoạt động',  cls: 'bg-green-50 text-green-700' },
  locked:     { label: 'Khoá',       cls: 'bg-red-50 text-red-700' },
  no_account: { label: 'Chưa có TK', cls: 'bg-gray-100 text-gray-500' },
}

const ACTION_LABELS: Record<string, string> = { view:'Xem', edit:'Sửa', delete:'Xoá', approve:'Duyệt', export:'Xuất' }

const AVATAR_COLORS = ['bg-blue-600','bg-green-600','bg-purple-600','bg-amber-600','bg-pink-600','bg-cyan-600','bg-red-500','bg-indigo-600']
function getInitials(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? (p[p.length-2][0]+p[p.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase()
}
function avatarColor(id: string) {
  let h = 0; for (let i=0;i<id.length;i++) h=id.charCodeAt(i)+((h<<5)-h)
  return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]
}

export default function PhanQuyenPage() {
  const { employees, setEmployees, permissionGroups: groups, setPermissionGroups: setGroups } = useAuth()

  // Group edit modal
  const [editGroup, setEditGroup] = useState<PermissionGroup | null>(null)
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set())

  // Employee permission modal
  const [editEmpId, setEditEmpId] = useState<string | null>(null)
  const [empRole, setEmpRole] = useState<UserRole>('employee')
  const [empOverrides, setEmpOverrides] = useState<Set<string>>(new Set())

  // Add group
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupLabel, setNewGroupLabel] = useState('')

  /* ── Group edit handlers ── */
  const openGroupEdit = (g: PermissionGroup) => {
    setEditGroup(g)
    setEditPerms(new Set(g.permissions))
  }

  const togglePerm = (perm: string) => {
    setEditPerms(prev => {
      const next = new Set(prev)
      if (next.has(perm)) next.delete(perm); else next.add(perm)
      return next
    })
  }

  const saveGroup = () => {
    if (!editGroup) return
    setGroups(prev => prev.map(g => g.id === editGroup.id ? { ...g, permissions: Array.from(editPerms) } : g))
    setEditGroup(null)
  }

  const addGroup = () => {
    if (!newGroupName.trim() || !newGroupLabel.trim()) return
    const id = `PG${String(groups.length + 1).padStart(2, '0')}`
    setGroups(prev => [...prev, { id, name: newGroupName.trim(), label: newGroupLabel.trim(), description: '', isSystem: false, permissions: ['dashboard.view'] }])
    setShowAddGroup(false)
    setNewGroupName('')
    setNewGroupLabel('')
  }

  /* ── Employee permission handlers ── */
  const editEmp = editEmpId ? employees.find(e => e.id === editEmpId) : null

  const openEmpEdit = (emp: Employee) => {
    setEditEmpId(emp.id)
    setEmpRole(emp.accountRole)
    setEmpOverrides(new Set(emp.accountPermissions))
  }

  const toggleEmpPerm = (perm: string) => {
    setEmpOverrides(prev => {
      const next = new Set(prev)
      if (next.has(perm)) next.delete(perm); else next.add(perm)
      return next
    })
  }

  const saveEmpPerms = () => {
    if (!editEmpId) return
    setEmployees(prev => prev.map(e => e.id === editEmpId
      ? { ...e, accountRole: empRole, accountPermissions: Array.from(empOverrides) }
      : e
    ))
    setEditEmpId(null)
  }

  /* ── Resolve which perms a group grants ── */
  const groupHasPerm = (g: PermissionGroup, perm: string) => {
    return g.permissions.includes('*') || g.permissions.includes(perm) || g.permissions.includes(perm.split('.')[0] + '.*')
  }

  /* ── Stats ── */
  const activeAccounts = employees.filter(e => e.accountStatus === 'active').length
  const lockedAccounts = employees.filter(e => e.accountStatus === 'locked').length

  return (
    <PageShell breadcrumb="Hệ thống" title="Phân quyền">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
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

      {/* ═══ SECTION 1: Permission Groups ═══ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-bold text-gray-900">Nhóm quyền</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Quản lý vai trò và quyền hạn theo nhóm</p>
          </div>
          <button onClick={() => setShowAddGroup(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Plus size={13}/> Thêm nhóm
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-44">Nhóm</th>
                {ALL_MODULES.map(m => (
                  <th key={m.key} className="text-center px-1.5 py-2.5 font-semibold text-gray-400 text-[10px] whitespace-nowrap">{m.label}</th>
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
                      return (
                        <td key={m.key} className="text-center px-1.5 py-2.5">
                          {g.permissions.includes('*') ? (
                            <span className="text-green-500 text-[10px] font-bold">ALL</span>
                          ) : hasView ? (
                            <span className={`inline-block w-4 h-4 rounded text-[9px] font-bold leading-4 ${hasEdit ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                              {hasEdit ? 'E' : 'V'}
                            </span>
                          ) : (
                            <span className="text-gray-200">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="text-center px-4 py-2.5">
                      <button onClick={() => openGroupEdit(g)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
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

      {/* ═══ SECTION 2: Employee Permissions ═══ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[13px] font-bold text-gray-900">Quyền hạn nhân viên</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Set vai trò và quyền cho từng nhân viên</p>
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
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500">Quyền riêng</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-500 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const role = ROLE_STYLE[emp.accountRole] || ROLE_STYLE.employee
                const acct = ACCT_STATUS[emp.accountStatus] || ACCT_STATUS.no_account
                return (
                  <tr key={emp.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                    <td className="px-4 py-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${avatarColor(emp.id)}`}>
                        {getInitials(emp.name)}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-900">{emp.name}</div>
                      <div className="text-[10px] text-gray-400">{emp.code} · {emp.position || '—'}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600 font-mono text-[11px]">{emp.accountEmail || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${role.cls}`}>
                        {role.icon} {groups.find(g => g.name === emp.accountRole)?.label || emp.accountRole}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${acct.cls}`}>{acct.label}</span>
                    </td>
                    <td className="px-4 py-2 text-center text-[10px] text-gray-500">
                      {emp.accountPermissions.length > 0 ? `+${emp.accountPermissions.length}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => openEmpEdit(emp)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Sửa quyền">
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

      {/* ═══ Group Edit Modal ═══ */}
      {editGroup && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setEditGroup(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[700px] max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Sửa nhóm quyền: {editGroup.label}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{editGroup.description}</p>
              </div>
              <button onClick={() => setEditGroup(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6">
              {editGroup.permissions.includes('*') ? (
                <div className="text-center py-8 text-sm text-gray-500">
                  <ShieldAlert size={32} className="mx-auto mb-2 text-red-400"/>
                  Nhóm Boss Admin có toàn quyền. Không thể chỉnh sửa.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500 w-40">Module</th>
                        {ALL_ACTIONS.map(a => (
                          <th key={a} className="text-center px-3 py-2 font-semibold text-gray-500">{ACTION_LABELS[a]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_MODULES.map(m => (
                        <tr key={m.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-3 py-2.5 font-medium text-gray-900">{m.label}</td>
                          {ALL_ACTIONS.map(a => {
                            const perm = `${m.key}.${a}`
                            const checked = editPerms.has(perm)
                            return (
                              <td key={a} className="text-center px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePerm(perm)}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {!editGroup.permissions.includes('*') && (
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
                <button onClick={() => setEditGroup(null)} className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Huỷ</button>
                <button onClick={saveGroup} className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-1.5">
                  <Check size={13}/> Lưu thay đổi
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Add Group Modal ═══ */}
      {showAddGroup && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowAddGroup(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[400px]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Thêm nhóm quyền</h3>
              <button onClick={() => setShowAddGroup(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Mã nhóm (tiếng Anh, không dấu)</label>
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" placeholder="vd: supervisor" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Tên hiển thị</label>
                <input value={newGroupLabel} onChange={e => setNewGroupLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" placeholder="vd: Giám sát viên" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowAddGroup(false)} className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={addGroup} className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold">Tạo nhóm</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Employee Permission Edit Modal ═══ */}
      {editEmp && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setEditEmpId(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-[700px] max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${avatarColor(editEmp.id)}`}>
                {getInitials(editEmp.name)}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900">{editEmp.name}</h3>
                <p className="text-[11px] text-gray-400">{editEmp.code} · {editEmp.accountEmail || '—'}</p>
              </div>
              <button onClick={() => setEditEmpId(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Role select */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Vai trò (nhóm quyền)</label>
                <select value={empRole} onChange={e => setEmpRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {groups.map(g => <option key={g.name} value={g.name}>{g.label} — {g.description}</option>)}
                </select>
              </div>

              {/* Override permissions */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Quyền bổ sung (override)</label>
                <p className="text-[10px] text-gray-400 mb-3">Tick thêm quyền ngoài nhóm. Quyền từ nhóm sẽ hiện màu xanh nhạt.</p>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500 w-36">Module</th>
                        {ALL_ACTIONS.map(a => (
                          <th key={a} className="text-center px-2 py-2 font-semibold text-gray-500">{ACTION_LABELS[a]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_MODULES.map(m => {
                        const roleGroup = groups.find(g => g.name === empRole)
                        return (
                          <tr key={m.key} className="border-b border-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{m.label}</td>
                            {ALL_ACTIONS.map(a => {
                              const perm = `${m.key}.${a}`
                              const fromGroup = roleGroup ? (roleGroup.permissions.includes('*') || roleGroup.permissions.includes(perm)) : false
                              const isOverride = empOverrides.has(perm)
                              return (
                                <td key={a} className={`text-center px-2 py-2 ${fromGroup && !isOverride ? 'bg-blue-50/50' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={fromGroup || isOverride}
                                    disabled={fromGroup}
                                    onChange={() => toggleEmpPerm(perm)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setEditEmpId(null)} className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={saveEmpPerms} className="px-5 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-1.5">
                <Check size={13}/> Lưu quyền
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
