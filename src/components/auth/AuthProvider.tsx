'use client'
import { SessionProvider, useSession } from "next-auth/react"
import useSWR from "swr"
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
  /** Force-refresh permissions from /api/me (call after edits in phanquyen). */
  refreshPermissions: () => Promise<unknown>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  hasPermission: () => false,
  isLoading: true,
  refreshPermissions: async () => undefined,
})

export function useAuth() {
  return useContext(AuthContext)
}

type MeResponse = {
  userId: string
  employeeId: string | null
  companyId: string | null
  role: string
  permissions: string[]
}

const meFetcher = async (url: string): Promise<MeResponse | null> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return null
  return res.json()
}

function AuthContextBridge({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const isLoggedIn = !!session?.user

  // Fresh permissions from the server — the JWT's permissions claim can be
  // stale after PermissionGroup edits. Refresh on focus and every 60 seconds.
  const { data: me, mutate: refreshMe } = useSWR<MeResponse | null>(
    isLoggedIn ? "/api/me" : null,
    meFetcher,
    {
      revalidateOnFocus: true,
      refreshInterval: 60_000,
      dedupingInterval: 5_000,
    }
  )

  const isLoading = status === "loading" || (isLoggedIn && !me)

  const user: SessionUser | null = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        // Prefer fresh /api/me data when available, fall back to JWT claims
        role: me?.role ?? ((session.user as any).role ?? "employee"),
        permissions: me?.permissions ?? ((session.user as any).permissions ?? []),
        employeeId: me?.employeeId ?? ((session.user as any).employeeId ?? null),
        companyId: me?.companyId ?? ((session.user as any).companyId ?? null),
      }
    : null

  const checkPerm = useCallback(
    (perm: string) => {
      if (!user) return false
      return hasPermission(user.permissions, perm)
    },
    [user]
  )

  const refreshPermissions = useCallback(() => refreshMe(), [refreshMe])

  return (
    <AuthContext.Provider
      value={{ user, hasPermission: checkPerm, isLoading, refreshPermissions }}
    >
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
