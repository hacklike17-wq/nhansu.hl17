import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      permissions: string[]
      employeeId?: string | null
      companyId?: string | null
    } & DefaultSession["user"]
  }
}
