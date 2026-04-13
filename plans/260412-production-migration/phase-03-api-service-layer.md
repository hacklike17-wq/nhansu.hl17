# Phase 03 — API & Service Layer: Route Handlers, Server Actions, Zod

**Parent:** `plan.md`
**Dependencies:** Phase 01 (db.ts, schema), Phase 02 (auth(), session shape)
**Research refs:** `research/researcher-01-nextjs-prisma-auth.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Establish the universal API pattern — service layer, Zod validation, standardized error responses, and the decision matrix for Server Actions vs Route Handlers. This phase defines conventions; Phase 04-06 implement modules using them.
- **Priority:** Critical
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Next.js 16: Route Handlers are dynamic by default. Avoid `export const dynamic = "force-dynamic"` — just don't add `"use cache"` and they stay dynamic. Only add `"use cache"` to data that is truly static (e.g., PITBracket rates for a given period).
- Server Actions are preferred for mutations — type-safe, no fetch boilerplate, integrated with React `useFormStatus`. Route Handlers are for: export endpoints (CSV/PDF), webhook receivers, endpoints consumed by external clients.
- Service layer (`src/services/`) is the single place where business logic lives — both Server Actions and Route Handlers call services, never Prisma directly in handlers.
- All mutations must check `companyId` from session — never trust `companyId` from request body.
- Zod schemas are colocated with the service they validate (`src/lib/schemas/<domain>.ts`).
- API error responses follow a single shape: `{ error: string, code?: string }`. Success: `{ data: T }` or `{ success: true }`.

---

## Requirements

1. Service layer pattern defined with concrete example (`EmployeeService`)
2. Zod schema files for each domain
3. Standardized API response helpers (`src/lib/api.ts`)
4. Error boundary for async Server Actions (`src/lib/action.ts`)
5. Permission guard utility for use in Route Handlers and Server Actions
6. `"use cache"` usage guidelines with example

---

## Architecture

### Decision matrix

| Use case | Mechanism | Why |
|----------|-----------|-----|
| Create / update / delete employee | Server Action | Form binding, type-safe, no fetch |
| Approve leave / payroll | Server Action | Transactional, session-aware |
| GET employees list (page load) | Server Component + db call | No round-trip, RSC streaming |
| Export payroll CSV | Route Handler (GET) | File response, browser download |
| Bulk import employees | Route Handler (POST) | Large body, multipart |
| Cashflow chart data | Server Component + `"use cache"` | Cacheable aggregate |

### File structure

```
src/
  services/
    employee.service.ts
    attendance.service.ts
    leave.service.ts
    payroll.service.ts
    finance.service.ts
    settings.service.ts
    permission.service.ts

  lib/
    api.ts              ← response helpers (ok, err, unauthorized, forbidden)
    action.ts           ← withAction() wrapper for Server Actions
    schemas/
      auth.ts
      employee.ts
      attendance.ts
      leave.ts
      payroll.ts
      finance.ts
      settings.ts

  app/
    api/
      employees/
        route.ts        ← GET (list), POST (create)
        [id]/
          route.ts      ← GET, PATCH, DELETE
      attendance/
        route.ts
      leave/
        route.ts
        [id]/
          route.ts
      payroll/
        route.ts
        [id]/
          route.ts
      finance/
        revenue/ route.ts
        expense/ route.ts
        budget/  route.ts
        debt/    route.ts
      settings/
        route.ts
      permissions/
        route.ts
      export/
        payroll/ route.ts   ← CSV export
```

### src/lib/api.ts

```typescript
import { NextResponse } from "next/server"
import type { ZodError } from "zod"

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

export function validationError(error: ZodError) {
  return NextResponse.json({ error: "Validation failed", details: error.flatten() }, { status: 400 })
}
```

### src/lib/action.ts (Server Action wrapper)

```typescript
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function withAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return { ok: false, error: msg }
  }
}
```

### Permission guard for Route Handlers

```typescript
// src/lib/guards.ts
import { auth } from "@/auth"
import { hasPermission } from "@/constants/data"

export async function requirePermission(permission: string) {
  const session = await auth()
  if (!session) return { session: null, error: "unauthorized" as const }
  if (!hasPermission(session.user.permissions, permission)) return { session: null, error: "forbidden" as const }
  return { session, error: null }
}
```

### Route Handler pattern

```typescript
// src/app/api/employees/route.ts
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { ok, err, unauthorized, forbidden, validationError } from "@/lib/api"
import { CreateEmployeeSchema } from "@/lib/schemas/employee"
import { hasPermission } from "@/constants/data"
import { employeeService } from "@/services/employee.service"

export async function GET() {
  const session = await auth()
  if (!session) return unauthorized()

  const employees = await employeeService.list(session.user.companyId!)
  return ok(employees)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return unauthorized()
  if (!hasPermission(session.user.permissions, "nhanvien.edit")) return forbidden()

  const body = await req.json()
  const parsed = CreateEmployeeSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const employee = await employeeService.create(session.user.companyId!, parsed.data)
  return ok(employee, 201)
}
```

### Service layer pattern

```typescript
// src/services/employee.service.ts
import { db } from "@/lib/db"
import type { CreateEmployeeInput } from "@/lib/schemas/employee"

export const employeeService = {
  async list(companyId: string) {
    return db.employee.findMany({
      where: { companyId },  // deletedAt: null handled by middleware
      orderBy: { fullName: "asc" },
    })
  },

  async create(companyId: string, data: CreateEmployeeInput) {
    return db.employee.create({
      data: { ...data, companyId },
    })
  },

  async update(companyId: string, id: string, data: Partial<CreateEmployeeInput>) {
    return db.employee.update({
      where: { id, companyId },  // companyId prevents cross-tenant update
      data,
    })
  },

  async softDelete(companyId: string, id: string) {
    return db.employee.update({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    })
  },
}
```

### Server Action pattern

```typescript
// src/app/nhanvien/actions.ts
"use server"
import { auth } from "@/auth"
import { hasPermission } from "@/constants/data"
import { CreateEmployeeSchema } from "@/lib/schemas/employee"
import { employeeService } from "@/services/employee.service"
import { withAction } from "@/lib/action"
import { revalidatePath } from "next/cache"

export async function createEmployee(formData: FormData) {
  const session = await auth()
  if (!session || !hasPermission(session.user.permissions, "nhanvien.edit")) {
    return { ok: false, error: "Forbidden" }
  }

  const raw = Object.fromEntries(formData)
  const parsed = CreateEmployeeSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid data" }

  return withAction(async () => {
    const employee = await employeeService.create(session.user.companyId!, parsed.data)
    revalidatePath("/nhanvien")
    return employee
  })
}
```

### Zod schema example (src/lib/schemas/employee.ts)

```typescript
import { z } from "zod"

export const CreateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  department: z.string().min(1),
  position: z.string().min(1),
  contractType: z.enum(["FULL_TIME", "PART_TIME", "INTERN", "FREELANCE"]),
  startDate: z.coerce.date(),
  baseSalary: z.coerce.number().int().min(0),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  taxCode: z.string().optional(),
  bhxhCode: z.string().optional(),
})

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial()
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>
```

### Caching guidance

```typescript
// Only for data that changes infrequently
"use cache"
import { cacheTag, cacheLife } from "next/cache"

async function getPITBrackets(companyId: string) {
  "use cache"
  cacheTag(`pit-brackets-${companyId}`)
  cacheLife("days")
  return db.pITBracket.findMany({ where: { companyId } })
}

// Invalidate when rates change
import { revalidateTag } from "next/cache"
revalidateTag(`pit-brackets-${companyId}`)
```

---

## Related Code Files

**New files:**
- `src/lib/api.ts`
- `src/lib/action.ts`
- `src/lib/guards.ts`
- `src/lib/schemas/employee.ts`
- `src/lib/schemas/attendance.ts`
- `src/lib/schemas/leave.ts`
- `src/lib/schemas/payroll.ts`
- `src/lib/schemas/finance.ts`
- `src/lib/schemas/settings.ts`
- `src/services/employee.service.ts`
- `src/services/attendance.service.ts`
- `src/services/leave.service.ts`
- `src/services/payroll.service.ts`
- `src/services/finance.service.ts`
- `src/services/settings.service.ts`
- `src/services/permission.service.ts`
- `src/app/api/employees/route.ts`
- `src/app/api/employees/[id]/route.ts`
- (additional route files per module — created in Phase 04/05/06)

**Modified:**
- `src/app/nhanvien/actions.ts` — first Server Action file created here as template

---

## Implementation Steps

1. Create `src/lib/api.ts` with response helpers
2. Create `src/lib/action.ts` with `withAction` wrapper
3. Create `src/lib/guards.ts` with `requirePermission`
4. Create all Zod schema files in `src/lib/schemas/`
5. Create `src/services/employee.service.ts` as canonical service template
6. Create stub service files for all other domains
7. Create `src/app/api/employees/route.ts` and `[id]/route.ts` as canonical API template
8. Verify: `GET /api/employees` returns 401 when unauthenticated
9. Verify: `POST /api/employees` with invalid body returns 400 with ZodError details
10. Verify: `POST /api/employees` with `employee` role returns 403

---

## Todo List

- [ ] Write src/lib/api.ts
- [ ] Write src/lib/action.ts
- [ ] Write src/lib/guards.ts
- [ ] Write Zod schemas for all domains
- [ ] Write employee.service.ts (canonical example)
- [ ] Write stub service files for all other domains
- [ ] Write /api/employees route handlers
- [ ] Test 401, 403, 400 responses
- [ ] Document pattern in this file for junior dev reference

---

## Success Criteria

- Unauthenticated request to any `/api/*` route returns 401
- Authorized request with wrong role returns 403
- Valid POST with schema violations returns 400 + field errors
- Valid POST creates DB record; response matches `{ data: { id: ... } }` shape
- Service functions have no direct `req`/`res` references — purely data in/out

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Server Action not re-validating session | Medium | High | Always call `auth()` at top of every Server Action — never trust client-passed userId |
| companyId missing from session for new users | Low | High | Add `companyId` to User table in seed; guard with runtime check |
| Zod schemas out of sync with Prisma types | Medium | Medium | Use `z.infer` to derive TS types — one source of truth |

---

## Security Considerations

- Session `companyId` is the tenant boundary — always filter `where: { companyId: session.user.companyId }` in all service queries
- Never accept `companyId` from request body — derive from session
- Server Actions must validate permissions — middleware only covers page routes, not `"use server"` function calls from client
- Rate limit aggressive — consider Vercel WAF rules on `/api/*` routes post-deployment

---

## Next Steps

Phase 04 (HR Modules) and Phase 05 (Finance) use this pattern verbatim for every module API and Server Action.
