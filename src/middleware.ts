import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

export default NextAuth(authConfig).auth

// Skip next-auth, Next internals, static assets, AND /api/cron/* (which
// uses its own Bearer-token CRON_SECRET auth, not a user session).
export const config = {
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
}
