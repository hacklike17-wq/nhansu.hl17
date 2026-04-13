import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { authConfig } from "./auth.config"
import { LoginSchema } from "@/lib/schemas/auth"
import { PERMISSION_GROUPS } from "@/constants/data"

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
            select: { accountStatus: true },
          })
          if (emp?.accountStatus === "LOCKED") return null
          if (emp?.accountStatus === "NO_ACCOUNT") return null
        }

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null

        // Resolve permissions: prefer DB PermissionGroup, fallback to static
        let permissions: string[] = user.permissions ?? []
        if (user.companyId && permissions.length === 0) {
          const group = await db.permissionGroup.findFirst({
            where: { companyId: user.companyId, name: user.role },
          })
          if (group) {
            permissions = group.permissions
          } else {
            const staticGroup = PERMISSION_GROUPS.find((g) => g.name === user.role)
            permissions = staticGroup?.permissions ?? []
          }
        } else if (permissions.length === 0) {
          const staticGroup = PERMISSION_GROUPS.find((g) => g.name === user.role)
          permissions = staticGroup?.permissions ?? []
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions,
          employeeId: user.employeeId,
          companyId: user.companyId,
        }
      },
    }),
  ],
})
