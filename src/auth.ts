import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { authConfig } from "./auth.config"
import { LoginSchema } from "@/lib/schemas/auth"
import { PERMISSION_GROUPS, normalizeRole } from "@/constants/data"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        })

        if (!user || !user.password) return null

        if (user.employeeId) {
          const emp = await db.employee.findUnique({
            where: { id: user.employeeId },
            select: { accountStatus: true, deletedAt: true },
          })
          if (!emp) return null
          if (emp.deletedAt) return null
          if (emp.accountStatus === "LOCKED") return null
          if (emp.accountStatus === "NO_ACCOUNT") return null
        }

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null

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
