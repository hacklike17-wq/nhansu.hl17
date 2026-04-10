'use client'
import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { AuthUser, Employee, PermissionGroup } from '@/types'
import {
  EMPLOYEES as INITIAL_EMPLOYEES,
  PERMISSION_GROUPS as INITIAL_GROUPS,
  resolvePermissionsFromGroups,
  hasPermission as checkPerm,
} from '@/constants/data'

type AuthContextType = {
  user: AuthUser | null
  employees: Employee[]
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>
  permissionGroups: PermissionGroup[]
  setPermissionGroups: React.Dispatch<React.SetStateAction<PermissionGroup[]>>
  login: (email: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
  changePassword: (oldPw: string, newPw: string) => { ok: boolean; error?: string }
  hasPermission: (perm: string) => boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  employees: [],
  setEmployees: () => {},
  permissionGroups: INITIAL_GROUPS,
  setPermissionGroups: () => {},
  login: () => ({ ok: false }),
  logout: () => {},
  changePassword: () => ({ ok: false }),
  hasPermission: () => false,
  isLoading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES)
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>(INITIAL_GROUPS)
  const [isLoading, setIsLoading] = useState(true)

  // Ref để tránh stale closure trong useEffect auto-refresh
  const userRef = useRef<AuthUser | null>(null)
  userRef.current = user

  // Load từ localStorage khi mount
  useEffect(() => {
    const storedGroups = localStorage.getItem('hl17_groups')
    const storedEmps = localStorage.getItem('hl17_employees')
    const stored = localStorage.getItem('hl17_user')
    if (storedGroups) {
      try { setPermissionGroups(JSON.parse(storedGroups)) } catch { /* ignore */ }
    }
    if (storedEmps) {
      try { setEmployees(JSON.parse(storedEmps)) } catch { /* ignore */ }
    }
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { /* ignore */ }
    }
    setIsLoading(false)
  }, [])

  // Persist employees
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('hl17_employees', JSON.stringify(employees))
    }
  }, [employees, isLoading])

  // Persist permissionGroups
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('hl17_groups', JSON.stringify(permissionGroups))
    }
  }, [permissionGroups, isLoading])

  // Auto-refresh user permissions khi employees hoặc permissionGroups thay đổi
  useEffect(() => {
    if (isLoading || !userRef.current) return
    const currentUser = userRef.current
    const emp = employees.find(e => e.id === currentUser.employeeId)
    if (!emp) return
    const newPerms = resolvePermissionsFromGroups(permissionGroups, emp.accountRole, emp.accountPermissions)
    if (
      JSON.stringify(newPerms) !== JSON.stringify(currentUser.permissions) ||
      emp.accountRole !== currentUser.role
    ) {
      const updated: AuthUser = { ...currentUser, role: emp.accountRole, permissions: newPerms }
      setUser(updated)
      localStorage.setItem('hl17_user', JSON.stringify(updated))
    }
  }, [employees, permissionGroups, isLoading])

  const login = (email: string, password: string) => {
    const found = employees.find(e => e.accountEmail === email && e.accountStatus !== 'no_account')
    if (!found) return { ok: false, error: 'Email không tồn tại trong hệ thống' }
    if (found.accountStatus === 'locked') return { ok: false, error: 'Tài khoản đã bị khóa' }
    if (found.accountPassword !== password) return { ok: false, error: 'Mật khẩu không chính xác' }

    const permissions = resolvePermissionsFromGroups(permissionGroups, found.accountRole, found.accountPermissions)
    const userData: AuthUser = {
      employeeId: found.id,
      name: found.name,
      email: found.email,
      accountEmail: found.accountEmail,
      role: found.accountRole,
      permissions,
      lastLogin: new Date().toISOString(),
    }
    setUser(userData)
    localStorage.setItem('hl17_user', JSON.stringify(userData))
    return { ok: true }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('hl17_user')
  }

  const changePassword = (oldPw: string, newPw: string) => {
    if (!user) return { ok: false, error: 'Chưa đăng nhập' }
    const emp = employees.find(e => e.id === user.employeeId)
    if (!emp) return { ok: false, error: 'Không tìm thấy nhân viên' }
    if (emp.accountPassword !== oldPw) return { ok: false, error: 'Mật khẩu hiện tại không đúng' }
    setEmployees(prev => prev.map(e => e.id === user.employeeId ? { ...e, accountPassword: newPw } : e))
    return { ok: true }
  }

  const hasPermission = useCallback((perm: string) => {
    if (!user) return false
    return checkPerm(user.permissions, perm)
  }, [user])

  return (
    <AuthContext.Provider value={{
      user, employees, setEmployees,
      permissionGroups, setPermissionGroups,
      login, logout, changePassword, hasPermission, isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
