# Code Standards & Conventions

**Project:** ADMIN_HL17 — nhansu.hl17
**Last Updated:** 2026-04-13

---

## 1. Language & Framework Conventions

### TypeScript

- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- All modules target ES2017 with ESNext module resolution
- Path alias `@/*` maps to `./src/*`
- No `any` types preferred — annotate explicitly where possible (Prisma result types may use `any` casts with a comment)
- Type imports use `import type` syntax where only types are consumed
- Const assertions (`as const`) used for tuple-based constants such as `ALL_ACTIONS`
- `z.infer<typeof Schema>` used to derive TypeScript types from Zod schemas — one source of truth

### Next.js App Router

- Module pages (`/luong/page.tsx`, etc.) are currently **Client Components** (`'use client'`) using SWR hooks
- `app/layout.tsx` is a Server Component; it wraps client providers but does not use hooks
- Route segments follow Vietnamese business terminology for URL paths (e.g., `/nhanvien`, `/chamcong`, `/luong`)
- Interactive UI state lives in Client Components; Route Handlers serve as the API layer

---

## 2. File Organization

### Naming Conventions

| Artifact | Convention | Example |
|----------|-----------|---------|
| Component files | PascalCase | `AuthProvider.tsx`, `PageShell.tsx` |
| Page files | lowercase `page.tsx` | `app/nhanvien/page.tsx` |
| Route Handler files | lowercase `route.ts` | `app/api/payroll/route.ts` |
| Service files | camelCase with `.service.ts` suffix | `payroll.service.ts` |
| Hook files | camelCase with `use` prefix | `usePayroll.ts` |
| Schema files | camelCase | `payroll.ts` in `lib/schemas/` |
| Utility files | camelCase | `utils.ts`, `format.ts`, `db.ts`, `formula.ts` |
| Type files | `index.ts` in `types/` | `types/index.ts` |
| Constants files | `data.ts` in `constants/` | `constants/data.ts` |
| Test files | `.test.ts` suffix | `formula.test.ts` |

### Component Placement

- `components/auth/` — authentication logic and route guards
- `components/layout/` — structural shell components (Sidebar, Topbar, PageShell, ThemeProvider)
- `components/ui/` — shadcn/ui primitive components (do not hand-edit; regenerate via CLI)
- `hooks/` — SWR data hooks (one per resource: `usePayroll`, `useEmployees`, etc.)
- `lib/services/` — business logic services called by Route Handlers
- `lib/schemas/` — Zod validation schemas co-located with domain

---

## 3. Component Patterns

### Module Page Structure (Client Component + SWR)

Current module pages are Client Components that use SWR hooks:

```tsx
// src/app/luong/page.tsx
'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { useAuth } from '@/components/auth/AuthProvider'
import { usePayroll, generatePayroll, updatePayrollStatus } from '@/hooks/usePayroll'
import { useEmployees } from '@/hooks/useEmployees'

export default function LuongPage() {
  const { user } = useAuth()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const { payrolls, isLoading, mutate } = usePayroll({ month })

  // ... component body
}
```

### Role-Based Data Scoping

Server-side enforcement is authoritative. Client-side filtering is for UX only:

**Server-side (Route Handler — authoritative):**
```typescript
// src/app/api/payroll/route.ts
const role = (session.user as any).role
const sessionEmployeeId: string | null = (session.user as any).employeeId ?? null
// employees can only see their own payslip
const employeeId = role === "employee"
  ? (sessionEmployeeId ?? "__none__")  // force own scope
  : searchParams.get("employeeId")
```

**Client-side (display filter — UX only):**
```tsx
const isEmployee = user?.role === 'employee'
// For display purposes; server already scopes the data
const filtered = payrolls.filter(p => isEmployee ? p.employeeId === user?.employeeId : true)
```

### SWR Hook Pattern

All data hooks follow this pattern:

```typescript
// src/hooks/usePayroll.ts
'use client'
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function usePayroll(params: { month?: string; employeeId?: string }) {
  const qs = new URLSearchParams()
  if (params.month) qs.set("month", params.month)
  const url = `/api/payroll?${qs.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    payrolls: (data ?? []) as any[],
    isLoading,
    error,
    mutate,
  }
}

// Mutation functions (not hooks — called imperatively)
export async function generatePayroll(month: string, employeeIds?: string[]) {
  const res = await fetch("/api/payroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, employeeIds }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
```

After a mutation, call `mutate()` from SWR to revalidate:
```tsx
await generatePayroll(month)
await mutate()  // triggers SWR revalidation
```

### Modal Pattern

Modals rendered inline with conditional rendering and a fixed overlay:

```tsx
{editItem && (
  <div
    className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
    onClick={() => setEditItem(null)}
  >
    <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl ...">
      {/* Modal content */}
    </div>
  </div>
)}
```

### Status Badge Pattern

All status values use a `STATUS_MAP` object keyed by status string:

```tsx
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:    { label: 'Nháp',           cls: 'bg-gray-100 text-gray-600' },
  PENDING:  { label: 'Chờ duyệt',      cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt',       cls: 'bg-green-100 text-green-700' },
  LOCKED:   { label: 'Đã khóa',        cls: 'bg-orange-100 text-orange-700' },
  PAID:     { label: 'Đã thanh toán',  cls: 'bg-blue-100 text-blue-700' },
}

<span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${STATUS_MAP[item.status].cls}`}>
  {STATUS_MAP[item.status].label}
</span>
```

---

## 4. Styling Conventions

### Tailwind v4

The project uses Tailwind CSS v4 with `@tailwindcss/postcss`. CSS variables defined in `globals.css` using `@theme inline`. Design language:

- `bg-[#F5F6FA]` — app background (light gray)
- `bg-white` with `border border-gray-200` — cards and panels
- `rounded-xl` and `rounded-2xl` — most containers
- Consistent spacing: `p-4`, `p-6`, `px-4 py-3`
- `text-[11px]`, `text-[13px]`, `text-xs`, `text-sm` for fine-grained type sizing
- `forcedTheme="light"` — dark mode CSS declared but disabled at `ThemeProvider` level

### Color System

Primary accent: `blue-600`

| Semantic | Background | Text | Border |
|----------|-----------|------|--------|
| Success / Approved | `bg-green-50` | `text-green-700` | `border-green-200` |
| Warning / Pending | `bg-amber-50` | `text-amber-700` | `border-amber-200` |
| Danger / Rejected | `bg-red-50` | `text-red-700` | `border-red-200` |
| Info / Blue | `bg-blue-50` | `text-blue-700` | `border-blue-200` |
| Locked / Orange | `bg-orange-50` | `text-orange-700` | `border-orange-200` |
| Neutral | `bg-gray-100` | `text-gray-600` | `border-gray-200` |

### Class Composition

Use `cn()` from `@/lib/utils` for all conditional class composition:

```tsx
import { cn } from '@/lib/utils'
<div className={cn('base-classes', condition && 'conditional-class', variantMap[value])} />
```

Never concatenate class strings manually with template literals for conditional classes.

---

## 5. Permission System

### Permission String Format

```
dashboard.view
nhanvien.edit
luong.approve
luong.export
baocao.export
caidat.config
```

Special permission `*` grants access to all modules (`boss_admin` only).

### Permission Check Logic

```
hasPermission(permissions, required)
  → true if permissions includes '*'
  → true if permissions includes required exactly
  → true if permissions includes '<module>.*'
  → false otherwise
```

### Checking Permissions

**In Route Handlers:**
```typescript
import { auth } from "@/auth"
import { hasPermission } from "@/constants/data"

const session = await auth()
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

const permissions: string[] = (session.user as any).permissions ?? []
if (!hasPermission(permissions, "luong.approve")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

**In client components (via `useAuth()`):**
```tsx
const { user } = useAuth()
const canApprove = hasPermission(user?.permissions ?? [], 'luong.approve')
{canApprove && <button onClick={approve}>Duyệt lương</button>}
```

**In middleware (`auth.config.ts`):**
```typescript
const requiredPerm = ROUTE_PERMISSION[pathname]
if (!requiredPerm) return true
const permissions: string[] = (auth?.user as any)?.permissions ?? []
return hasPermission(permissions, requiredPerm)
```

### Payroll Permission Matrix

| Permission | hr_manager | accountant | admin | boss_admin |
|-----------|-----------|-----------|-------|-----------|
| `luong.view` | Yes | Yes | Yes | Yes (`*`) |
| `luong.edit` | Yes | No | Yes | Yes (`*`) |
| `luong.approve` | No | Yes | Yes | Yes (`*`) |
| `luong.export` | No | Yes | Yes | Yes (`*`) |
| `luong.config` | No | No | Yes | Yes (`*`) |

---

## 6. Route Handler Pattern

### Standard Route Handler

```typescript
// src/app/api/payroll/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { hasPermission } from "@/constants/data"
import { db } from "@/lib/db"
import { GeneratePayrollSchema } from "@/lib/schemas/payroll"
import { upsertPayroll } from "@/lib/services/payroll.service"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  // ... query and return
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const permissions: string[] = (session.user as any).permissions ?? []
  if (!hasPermission(permissions, "luong.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = GeneratePayrollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // ... call service, return result
  return NextResponse.json(result, { status: 201 })
}
```

### Route Handler Rules

1. Always call `auth()` as the first line
2. Check `companyId` from session — never trust request body for tenant scope
3. Check required permission via `hasPermission()` before any mutation
4. Validate input with Zod before touching the DB
5. Call service functions (e.g., `payroll.service.ts`) rather than Prisma directly for complex operations
6. After attendance mutations: call `autoRecalcDraftPayroll()` to keep DRAFT payrolls in sync

### Response Shape Conventions

- Success (list): `NextResponse.json(array)` with 200
- Success (create): `NextResponse.json(item, { status: 201 })`
- Unauthorized: `NextResponse.json({ error: "Unauthorized" }, { status: 401 })`
- Forbidden: `NextResponse.json({ error: "Forbidden" }, { status: 403 })`
- Validation error: `NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })`
- Not found: `NextResponse.json({ error: "Not found" }, { status: 404 })`
- Internal error: `NextResponse.json({ error: message }, { status: 500 })`

---

## 7. Zod Validation Pattern

Zod schemas co-located with domain in `src/lib/schemas/<domain>.ts`:

```typescript
// src/lib/schemas/payroll.ts
import { z } from "zod"

export const GeneratePayrollSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  employeeIds: z.array(z.string()).optional(),
  missingOnly: z.boolean().optional(),
})
```

Use `z.infer<typeof Schema>` to derive TypeScript types. Use `.safeParse()` in Route Handlers (not `.parse()` — never throw from handlers).

---

## 8. Service Layer Pattern

All complex business logic lives in `src/lib/services/*.service.ts`. Route Handlers call services, not Prisma directly:

```typescript
// src/lib/services/payroll.service.ts
export async function upsertPayroll(
  companyId: string,
  employeeId: string,
  monthStr: string // "YYYY-MM"
) {
  // 1. Guard: never recalculate non-DRAFT payrolls
  const existing = await db.payroll.findUnique({
    where: { employeeId_month: { employeeId, month: monthDate } },
    select: { status: true },
  })
  if (existing && existing.status !== "DRAFT") return // skip silently

  // 2. Calculate
  const calc = await calculatePayroll(companyId, employeeId, monthDate)

  // 3. Upsert (create or update DRAFT)
  return db.payroll.upsert({ ... })
}
```

**Service layer rules:**
- Always include `companyId` in `where` clauses — tenant isolation
- Never accept `companyId` from request body — derive from session
- Never return `password` field — use explicit `select`
- Convert `Decimal` to `Number` before returning (Prisma `Decimal` is not JSON-serializable): `Number(decimal.toString())`
- Service functions should not throw for expected errors — return `null` or guard with `if (!existing) return`

---

## 9. Approval Action Pattern

All status transitions (payroll, leave) must follow this pattern:

### Concurrency Guard

```typescript
// In Route Handler: PATCH /api/payroll/[id] → status: APPROVED
await db.$transaction(async (tx) => {
  const result = await tx.payroll.updateMany({
    where: {
      id: payrollId,
      companyId: (session.user as any).companyId,
      status: "PENDING",          // precondition guard
    },
    data: {
      status: "APPROVED",
      approvedBy: session.user.id,
      approvedAt: new Date(),
    },
  })

  if (result.count === 0) {
    throw new Error("Bảng lương đã được xử lý bởi người khác")
  }

  await tx.auditLog.create({
    data: {
      companyId: (session.user as any).companyId,
      entityType: "Payroll",
      entityId: payrollId,
      action: "APPROVED",
      changedBy: session.user.id,
    }
  })
})
```

### Payroll Status Machine

```
DRAFT → PENDING → APPROVED → LOCKED → PAID
  ↑           ↑             ↑          ↑
  luong.edit  luong.approve luong.approve luong.approve
```

- `DRAFT`: editable, recalculate-able, deletable
- `PENDING`: submitted for approval; attendance mutations still trigger `needsRecalc=true` but do not recalculate automatically
- `APPROVED`: approved; no changes allowed
- `LOCKED`: immutable — `snapshot` JSON captured; accounting disbursement phase
- `PAID`: final state

`needsRecalc` flag:
- Set `true` when attendance changes occur for a DRAFT payroll
- Cleared after recalculation
- Never touches APPROVED/LOCKED/PAID rows

### Leave Request State Machine

```
PENDING → APPROVED  (creates batch DeductionEvents in db.$transaction())
        → REJECTED  (removes DeductionEvents if re-rejecting)
        → CANCELLED (by employee, if PENDING)
```

---

## 10. Formula Engine Usage

### Formula Variables Available to SalaryColumn Formulas

| Variable | Description |
|----------|------------|
| `luong_co_ban` | Employee base salary |
| `luong_trach_nhiem` | Responsibility salary |
| `cong_so_nhan` | Total work units received |
| `cong_so_tru` | Total deduction units |
| `cong_so` / `net_cong_so` | Net work units (= cong_so_nhan + cong_so_tru) |
| `gio_tang_ca` | Total overtime hours |
| `phu_cap` / `tien_phu_cap` | Allowance (manual input) |
| `thuong` | Bonus (manual input) |
| `phat` / `tien_phat` | Penalty (manual input) |
| `kpi_chuyen_can` | KPI attendance deduction (manual input) |
| `kpi_trach_nhiem` | KPI responsibility deduction (manual input) |

Formula results from earlier columns feed later columns (topological sort). System-skipped key: `tong_thuc_nhan` (always computed explicitly, never via formula engine).

### Validating a Formula Before Save

```typescript
import { validateFormula } from "@/lib/formula"

const result = validateFormula(
  formula,           // formula string to validate
  knownVars,         // array of all available variable names
  sampleVars         // sample values for preview calculation
)
// result: { ok: boolean; error?: string; preview?: number }
```

### Formula Column Example

```
// Column key: tong_luong_co_ban
// Formula: luong_co_ban * cong_so / 26
// Variables used: luong_co_ban, cong_so
```

---

## 11. Currency and Formatting

Always use the provided formatting utilities:

```tsx
import { fmtVND, fmtMoney, fmtDate } from '@/lib/format'

fmtVND(12_500_000)       // "12.500.000"
fmtMoney(1_200_000_000)  // "1.2 tỷ"
fmtMoney(500_000_000)    // "500 tr"
fmtDate('2026-04-09')    // "09/04/2026"
```

Never use `toLocaleString()` directly. All VND amounts stored as `Decimal @db.Decimal(15,0)` in PostgreSQL. Convert to `Number` when passing to client or formatters:
```typescript
Number(prismaDecimalField.toString())
```

---

## 12. Auth Context Pattern

### `useAuth()` Hook

```tsx
import { useAuth } from '@/components/auth/AuthProvider'

const { user, hasPermission, isLoading } = useAuth()
// user: { id, name, email, role, permissions, employeeId, companyId } | null
// hasPermission: (perm: string) => boolean
// isLoading: boolean (true while session loads)
```

### Auth Flow

1. `middleware.ts` (Edge) → `authorized` callback → checks JWT → allows or redirects to `/login`
2. `ProtectedLayout` → checks `user` from `useAuth()` → shows loading or redirects
3. Page components → use `useAuth()` for display-layer permission checks
4. Route Handlers → call `auth()` from `next-auth` → session from JWT cookie
5. `companyId` from JWT session → used to scope all DB queries

---

## 13. Navigation Configuration

Navigation sections declared in `NAV_SECTIONS` within `constants/data.ts`. Each item has an `icon` key that maps to `ICON_MAP` in `Sidebar.tsx`.

To add a new navigation item:
1. Add route page in `src/app/<route>/page.tsx`
2. Add permission mapping in `ROUTE_PERMISSION` in `constants/data.ts`
3. Add nav item to `NAV_SECTIONS` in `constants/data.ts`
4. If a new icon key is needed, add it to `ICON_MAP` in `Sidebar.tsx`

---

## 14. Testing

### Vitest Unit Tests

Tests live in `src/lib/__tests__/formula.test.ts` (24 tests). Run:

```bash
npm run test             # run all tests once
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report
```

Tests cover formula engine functions:
- `evalFormula`: basic arithmetic, null returns, edge cases
- `extractVars`: variable extraction from formulas
- `buildDependencyGraph`: column dependency graph construction
- `topologicalSort`: correct evaluation order; `CircularDependencyError` on cycles
- `detectCircular`: cycle detection for UI validation
- `validateFormula`: syntax, unknown vars, preview calculation

When adding a new formula engine feature, add corresponding tests in `formula.test.ts`.

---

## 15. ESLint Configuration

ESLint 9 flat config (`eslint.config.mjs`) using `eslint-config-next`. Run:

```bash
npm run lint
```

The default Next.js lint rules apply. Both lint and TypeScript checking should pass before merge.
