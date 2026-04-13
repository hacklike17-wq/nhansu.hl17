# Research: Next.js 16 + PostgreSQL + Prisma + Auth.js Stack

**Date:** 2026-04-12

---

## 1. Prisma ORM + PostgreSQL Schema Architecture

**Key Decisions:**
- Use multi-file schema organization (`prismaSchemaFolder`) for HR domains: users, employees, attendance, payroll, permissions
- Define bidirectional relations (both sides explicit) for clarity
- Index frequently queried fields (foreign keys, role, status, dates)

**Connection Pattern:**
```typescript
// prisma.ts singleton
import { PrismaClient } from "@prisma/client"
declare global { var prismaGlobal: PrismaClient }

export const db = globalThis.prismaGlobal || new PrismaClient({ log: ["error"] })
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = db
```

---

## 2. Auth.js v5 (NextAuth v5) + Credentials Provider

**Key pattern — callbacks must live in `auth.config.ts` for middleware access:**
```typescript
export const authConfig = {
  adapter: PgAdapter(pool),
  providers: [
    Credentials({
      async authorize(credentials) {
        const user = await db.user.findUnique({ where: { email: credentials.email }, include: { role: true } })
        return user && bcrypt.compareSync(credentials.password, user.password)
          ? { ...user, role: user.role.name } : null
      }
    })
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.role = user.role
      session.user.permissions = user.permissions
      return session
    }
  }
}
```

**middleware.ts for RBAC:**
```typescript
import { auth } from "@/auth"
export async function middleware(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.redirect(new URL("/login", request.url))
  // Route-level permission check here
  return NextResponse.next()
}
```

---

## 3. API Layer: Route Handlers vs Server Actions

**Decision matrix:**
- **Server Actions** → internal mutations (update attendance, change salary) — type-safe, form binding
- **Route Handlers** → public APIs, webhooks, explicit HTTP caching

**Zod validation pattern:**
```typescript
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  
  const body = await req.json()
  const validated = Schema.parse(body) // throws ZodError on invalid input
  
  const record = await db.model.create({ data: validated })
  return Response.json({ success: true, data: record })
}
```

**Standardized error response:**
```typescript
// Zod errors → 400
// Auth failures → 401/403
// DB errors → 500
```

---

## 4. Next.js 16 Breaking Changes (Critical)

- **Implicit → Explicit Caching:** Pages are dynamic by default. Use `"use cache"` directive to opt-in to caching.
- **Route Handlers** must return explicit `Response` objects (not plain objects)
- Default dynamic rendering eliminates stale data issues but requires intentional `"use cache"` for high-traffic APIs

---

## 5. Production Connection Pooling

**Strategy:**
- **Dev:** Direct connection (`DATABASE_URL` with `sslmode=disable`)
- **Production (Vercel/serverless):** PgBouncer transaction mode + `?pgbouncer=true` query param (disables prepared statements)
- **Alternatively:** Prisma Accelerate, Neon session pooler, or Supabase session pooler

```
# .env
DATABASE_URL="postgresql://user:pass@host:5432/dbname?pgbouncer=true&sslmode=require"
```

---

## 6. CI/CD Migration Workflow

```yaml
- run: npm ci
- run: npx prisma generate
- run: npx prisma migrate deploy  # NOT migrate dev
- run: npm run build
```

**Critical:** `prisma migrate deploy` in production (never `migrate dev`). Make Prisma a production dependency.

---

## Summary Decisions

| Layer | Choice |
|-------|--------|
| Auth | Auth.js v5 + Credentials provider + PgAdapter |
| Session | DB sessions (not JWT) for RBAC integrity |
| API mutations | Server Actions preferred; Route Handlers for REST endpoints |
| Validation | Zod on every API input |
| Caching | Explicit `"use cache"` directive; default dynamic |
| Pooling | PgBouncer + `?pgbouncer=true` or Prisma Accelerate |

---

## Sources
- Prisma Documentation (prisma.io/docs)
- Auth.js RBAC Guide (authjs.dev)
- Next.js 16 Caching Blog
- Prisma Connection Pooling Docs
