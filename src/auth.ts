import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { authConfig } from "./auth.config"
import { LoginSchema } from "@/lib/schemas/auth"
import { PERMISSION_GROUPS, normalizeRole } from "@/constants/data"
import {
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginAttempts,
} from "@/lib/rate-limit"

/**
 * Extract the caller IP from a Web API Request. nginx on the VPS sets
 * `x-forwarded-for`; fall back to `x-real-ip` or "unknown" so rate-limit
 * keys never collide on a missing header.
 */
function getClientIp(req: Request | undefined): string {
  if (!req) return "unknown"
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials, request) {
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const email = parsed.data.email.toLowerCase()
        const ip = getClientIp(request as Request | undefined)
        const rateKey = `${ip}:${email}`

        // Rate-limit BEFORE hitting the DB so a brute-forcer can't even
        // probe existence of accounts after exceeding the budget.
        const rlCheck = checkLoginRateLimit(rateKey)
        if (!rlCheck.allowed) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        })

        if (!user || !user.password) {
          recordLoginFailure(rateKey)
          return null
        }

        if (user.employeeId) {
          const emp = await db.employee.findUnique({
            where: { id: user.employeeId },
            select: { accountStatus: true, deletedAt: true },
          })
          if (!emp) { recordLoginFailure(rateKey); return null }
          if (emp.deletedAt) { recordLoginFailure(rateKey); return null }
          if (emp.accountStatus === "LOCKED") { recordLoginFailure(rateKey); return null }
          if (emp.accountStatus === "NO_ACCOUNT") { recordLoginFailure(rateKey); return null }
        }

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) {
          recordLoginFailure(rateKey)
          return null
        }

        // Successful auth — clear the counter so the user starts fresh.
        clearLoginAttempts(rateKey)

        const canonicalRole = normalizeRole(user.role)

        let basePerms: string[] = []
        if (user.companyId) {
          const dbGroup = await db.permissionGroup.findFirst({
            where: { companyId: user.companyId, name: canonicalRole },
          })
          if (dbGroup) basePerms = dbGroup.permissions
        }
        if (basePerms.length === 0) {
          const staticGroup = PERMISSION_GROUPS.find((g) => g.name === canonicalRole)
          basePerms = staticGroup?.permissions ?? []
        }

        const merged = new Set<string>(basePerms)
        for (const p of user.permissions ?? []) merged.add(p)

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: canonicalRole,
          permissions: Array.from(merged),
          employeeId: user.employeeId,
          companyId: user.companyId,
        }
      },
    }),
  ],
})
