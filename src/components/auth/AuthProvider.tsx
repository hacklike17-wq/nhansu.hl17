'use client'
import { SessionProvider, useSession } from "next-auth/react"
import { createContext, useContext, useCallback, type ReactNode } from "react"
import { hasPermission } from "@/constants/data"

type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
  role: string
  permissions: string[]
  employeeId?: string | null
  companyId?: string | null
}

type AuthContextType = {
  user: SessionUser | null
  hasPermission: (perm: string) => boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  hasPermission: () => false,
  isLoading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

function AuthContextBridge({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const isLoading = status === "loading"

  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: (session.user as any).role ?? "employee",
        permissions: (session.user as any).permissions ?? [],
        employeeId: (session.user as any).employeeId ?? null,
        companyId: (session.user as any).companyId ?? null,
      }
    : null

  const checkPerm = useCallback(
    (perm: string) => {
      if (!user) return false
      return hasPermission(user.permissions, perm)
    },
    [user]
  )

  return (
    <AuthContext.Provider value={{ user, hasPermission: checkPerm, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthContextBridge>{children}</AuthContextBridge>
    </SessionProvider>
  )
}
