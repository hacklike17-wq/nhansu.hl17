import type { NextAuthConfig } from "next-auth"
import { ROUTE_PERMISSION, hasPermission, normalizeRole } from "@/constants/data"

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // 8 hours — balances "NV không phải login liên tục trong ngày" with
    // "NV bị terminated không kéo dài session 30 ngày (default Auth.js)".
    maxAge: 8 * 60 * 60,
  } as const,
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const pathname = request.nextUrl.pathname

      if (pathname.startsWith("/api/auth")) return true

      if (pathname === "/login") {
        if (isLoggedIn) return Response.redirect(new URL("/", request.nextUrl))
        return true
      }

      if (!isLoggedIn) return false

      const requiredPerm = ROUTE_PERMISSION[pathname]
      if (!requiredPerm) return true

      const permissions: string[] = (auth?.user as any)?.permissions ?? []
      return hasPermission(permissions, requiredPerm)
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role ?? "employee"
        token.permissions = (user as any).permissions ?? []
        token.employeeId = (user as any).employeeId ?? null
        token.companyId = (user as any).companyId ?? null
      }
      // Normalize role every read — handles cached JWTs minted with legacy
      // role names (boss_admin/hr_manager/accountant) after the RBAC rewrite.
      token.role = normalizeRole(token.role as string)
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = normalizeRole(token.role as string)
      ;(session.user as any).permissions = token.permissions ?? []
      ;(session.user as any).employeeId = token.employeeId ?? null
      ;(session.user as any).companyId = token.companyId ?? null
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
