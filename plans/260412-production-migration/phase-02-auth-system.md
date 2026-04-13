# Phase 02 — Auth System: Auth.js v5, Middleware RBAC, Session

**Parent:** `plan.md`
**Dependencies:** Phase 01 (DB schema, User/Session/Account tables, db.ts)
**Research refs:** `research/researcher-01-nextjs-prisma-auth.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Replace client-side localStorage auth with Auth.js v5 Credentials provider, PostgreSQL session storage, and server-side RBAC in middleware.ts. Slim down AuthProvider to session snapshot only.
- **Priority:** Critical
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Auth.js v5 (NextAuth v5) has a split config pattern: `auth.config.ts` (no DB imports — safe for Edge middleware) and `auth.ts` (full config with PgAdapter). This is mandatory — middleware cannot import Prisma (Node.js-only).
- PgAdapter with Credentials provider requires manual password verification in `authorize()` — the adapter does not handle password hashing.
- Session strategy must be `"database"` (not JWT) to allow server-side revocation and RBAC updates to take effect immediately.
- `session.user.role` and `session.user.permissions` must be injected via `callbacks.session` — they are not in the default session shape.
- Current `ProtectedLayout.tsx` does client-side redirect on every navigation — middleware replaces this at the edge, eliminating flash and reducing client JS.
- `hasPermission()` utility from `constants/data.ts` is kept and reused in middleware (pure function, no imports, safe for Edge).
- bcrypt (`bcryptjs` — pure JS) must be used for password hashing; avoid native `bcrypt` on Vercel Edge.

---

## Requirements

1. Auth.js v5 installed and configured with Credentials provider
2. PgAdapter using the same Prisma client (`db.ts`)
3. Passwords hashed with bcryptjs on account creation; verified in `authorize()`
4. Session stores `userId`, `role`, `permissions`, `employeeId`, `companyId`
5. `middleware.ts` protects all routes except `/login`; enforces RBAC via `ROUTE_PERMISSION` map
6. `AuthProvider.tsx` slimmed to: holds session snapshot from `useSession()`, exposes `hasPermission()` helper — no more data arrays, no more localStorage
7. `ProtectedLayout.tsx` simplified — remove redirect logic (middleware handles it); keep sidebar/layout rendering
8. `src/app/login/page.tsx` rewritten to use `signIn()` from Auth.js
9. Type augmentation for `Session` to include custom fields

---

## Architecture

### File structure

```
src/
  auth.config.ts          ← Edge-safe config (no DB import) — callbacks, pages, providers stub
  auth.ts                 ← Full config with PgAdapter — extends auth.config.ts
  middleware.ts           ← Auth check + RBAC enforcement (uses auth.config.ts only)

  app/
    api/
      auth/
        [...nextauth]/
          route.ts        ← GET/POST handler for Auth.js endpoints

  components/
    auth/
      AuthProvider.tsx    ← SLIMMED: useSession wrapper + hasPermission helper
      ProtectedLayout.tsx ← SIMPLIFIED: layout only, no redirect logic
```

### auth.config.ts (Edge-safe)

```typescript
import type { NextAuthConfig } from "next-auth"
import { ROUTE_PERMISSION, hasPermission } from "@/constants/data"

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "database" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const pathname = request.nextUrl.pathname

      if (pathname === "/login") {
        if (isLoggedIn) return Response.redirect(new URL("/", request.nextUrl))
        return true
      }

      if (!isLoggedIn) return false  // redirect to /login

      // RBAC check
      const requiredPerm = ROUTE_PERMISSION[pathname]
      if (!requiredPerm) return true  // no restriction on this route
      const permissions: string[] = auth?.user?.permissions ?? []
      return hasPermission(permissions, requiredPerm)
    },
    async session({ session, user }) {
      // user comes from DB via PgAdapter
      session.user.id = user.id
      session.user.role = (user as any).role
      session.user.permissions = (user as any).permissions ?? []
      session.user.employeeId = (user as any).employeeId
      session.user.companyId = (user as any).companyId
      return session
    },
  },
  providers: [],  // providers added in auth.ts
} satisfies NextAuthConfig
```

### auth.ts (full config, Node.js only)

```typescript
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { authConfig } from "./auth.config"
import { LoginSchema } from "@/lib/schemas/auth"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          include: { employee: { select: { id: true, accountStatus: true } } },
        })

        if (!user || !user.password) return null
        if (user.employee?.accountStatus === "LOCKED") return null

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null

        // Fetch permissions from PermissionGroup
        const permGroup = await db.permissionGroup.findFirst({
          where: { companyId: user.companyId ?? "", name: user.role },
        })

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: permGroup?.permissions ?? [],
          employeeId: user.employeeId,
          companyId: user.companyId,
        }
      },
    }),
  ],
})
```

### middleware.ts

```typescript
import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
```

### Type augmentation (src/types/next-auth.d.ts)

```typescript
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      permissions: string[]
      employeeId?: string
      companyId?: string
    } & DefaultSession["user"]
  }
}
```

### API route handler (src/app/api/auth/[...nextauth]/route.ts)

```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

### Zod schema for login (src/lib/schemas/auth.ts)

```typescript
import { z } from "zod"

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})
```

### New AuthProvider.tsx (slimmed)

```typescript
'use client'
import { SessionProvider, useSession } from "next-auth/react"
import { createContext, useContext, useCallback } from "react"
import { hasPermission } from "@/constants/data"

type AuthContextType = {
  user: { id: string; name?: string | null; email?: string | null; role: string; permissions: string[]; employeeId?: string } | null
  hasPermission: (perm: string) => boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  hasPermission: () => false,
  isLoading: true,
})

export function useAuth() { return useContext(AuthContext) }

function AuthContextBridge({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const user = session?.user ?? null
  const checkPerm = useCallback((perm: string) => {
    if (!user) return false
    return hasPermission(user.permissions, perm)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, hasPermission: checkPerm, isLoading: status === "loading" }}>
      {children}
    </AuthContext.Provider>
  )
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthContextBridge>{children}</AuthContextBridge>
    </SessionProvider>
  )
}
```

### Simplified ProtectedLayout.tsx

```typescript
'use client'
import Sidebar from '@/components/layout/Sidebar'
import { usePathname } from 'next/navigation'

// Middleware handles auth redirect — this component only handles layout
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
```

### Updated Login page

```typescript
'use client'
import { signIn } from "next-auth/react"

// Replace login() from useAuth() with:
const result = await signIn("credentials", { email, password, redirect: false })
if (result?.ok) router.push("/")
else setError("Email hoặc mật khẩu không đúng")
```

---

## Related Code Files

**Modified:**
- `src/components/auth/AuthProvider.tsx` — slim to session bridge only
- `src/components/auth/ProtectedLayout.tsx` — remove redirect logic
- `src/app/login/page.tsx` — use `signIn()` from next-auth/react
- `src/app/layout.tsx` — wrap with `SessionProvider` (via AuthProvider)
- `package.json` — add `next-auth`, `bcryptjs`, `zod`, `@types/bcryptjs`

**New files:**
- `src/auth.config.ts`
- `src/auth.ts`
- `src/middleware.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/lib/schemas/auth.ts`
- `src/types/next-auth.d.ts`

**Removed logic (not files):**
- All `localStorage.setItem/getItem` calls in AuthProvider
- Employee/attendance/deductions arrays from AuthProvider context
- Client-side `login()` / `logout()` functions (replaced by `signIn`/`signOut`)

---

## Implementation Steps

1. `npm install next-auth@beta @auth/prisma-adapter bcryptjs zod && npm install -D @types/bcryptjs`
2. Generate `NEXTAUTH_SECRET`: `openssl rand -base64 32` → add to `.env.local`
3. Write `src/auth.config.ts` (Edge-safe, no Prisma import)
4. Write `src/auth.ts` (full, with PgAdapter + Credentials)
5. Write `src/middleware.ts` (exports `auth` from auth.config)
6. Create `src/app/api/auth/[...nextauth]/route.ts`
7. Write `src/lib/schemas/auth.ts` (Zod login schema)
8. Add `src/types/next-auth.d.ts` type augmentation
9. Rewrite `AuthProvider.tsx` — SessionProvider + thin context bridge
10. Simplify `ProtectedLayout.tsx` — layout only
11. Update `src/app/login/page.tsx` to call `signIn("credentials", ...)`
12. Add a script to hash initial passwords and insert test User records: `npx ts-node prisma/scripts/create-users.ts`
13. Test: login → session cookie set → `/` accessible → `/nhanvien` accessible for authorized roles → `/luong` blocked for `employee` role
14. Verify `signOut()` destroys DB session row

---

## Todo List

- [ ] Install next-auth@beta, @auth/prisma-adapter, bcryptjs, zod
- [ ] Generate and add NEXTAUTH_SECRET to env
- [ ] Write auth.config.ts (Edge-safe)
- [ ] Write auth.ts (full config with PgAdapter + Credentials)
- [ ] Write middleware.ts
- [ ] Create API route handler [...nextauth]/route.ts
- [ ] Write Zod LoginSchema
- [ ] Add next-auth.d.ts type augmentation
- [ ] Rewrite AuthProvider.tsx (slim)
- [ ] Simplify ProtectedLayout.tsx
- [ ] Update login page to use signIn()
- [ ] Create prisma seed user script with hashed passwords
- [ ] End-to-end login test
- [ ] Verify RBAC: employee role blocked from /luong
- [ ] Verify signOut destroys session in DB

---

## Success Criteria

- Login with correct credentials → session cookie set, redirect to `/`
- Login with wrong password → error shown, no session
- Navigate to `/phanquyen` as `employee` role → redirected to `/`
- After `signOut()` → session row deleted from DB, cookie cleared
- `middleware.ts` uses only `auth.config.ts` (no Prisma import) — edge-compatible

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auth.js v5 API changes (beta) | Medium | High | Pin to specific beta version; read `node_modules/next-auth/dist/` docs |
| PgAdapter incompatibility with custom User fields | Medium | Medium | Extend adapter User model via Prisma schema; test session callbacks |
| bcrypt too slow on Vercel Edge | N/A | N/A | bcrypt runs in authorize() which is in auth.ts (Node.js, not Edge) |
| Employee LOCKED status not checked on session refresh | Medium | High | Check status in `authorized` callback via DB lookup, or clear session on status change |

---

## Security Considerations

- Passwords hashed with bcrypt cost factor 12 minimum
- No plaintext passwords anywhere — `constants/data.ts` mock passwords removed in Phase 07
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax` (Auth.js defaults)
- `NEXTAUTH_SECRET` must be 32+ bytes, never committed
- Rate limiting on `/api/auth/callback/credentials` — implement via middleware or Vercel Edge Config after initial deployment
- `authorized` callback in `auth.config.ts` is the single enforcement point — no client-side bypass possible

---

## Next Steps

Phase 03 (API & Service Layer) unlocks after this:
- `auth()` from `@/auth` can be imported in Route Handlers and Server Actions
- Session shape is known for type-safe service layer
- Middleware RBAC is live, so API routes can rely on it + add resource-level checks
