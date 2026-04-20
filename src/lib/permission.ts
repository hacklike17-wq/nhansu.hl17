import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import {
  PERMISSION_GROUPS,
  hasPermission,
  normalizeRole,
  type CanonicalRole,
} from "@/constants/data"

export type SessionCtx = {
  userId: string
  employeeId: string | null
  companyId: string | null
  role: CanonicalRole
  rawRole: string
  permissions: string[]
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  console.error("[permission] unexpected error:", e)
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
}

/**
 * Resolve the canonical permissions list for a user at request-time.
 *
 * This is the single source of truth for authz checks. We never trust the
 * JWT token's `permissions` claim because:
 *   1. Admins can edit PermissionGroup rows in the UI — a cached JWT issued
 *      before the edit would carry stale perms.
 *   2. A user's role can be reassigned while they're logged in.
 *   3. User-level override rows (User.permissions) may be added/revoked.
 *
 * One lookup per API call adds minimal latency (indexed query on
 * PermissionGroup + point-read on User). In exchange we get always-correct
 * enforcement without forcing users to log out after every permission change.
 */
export async function resolvePermissionsForUser(
  userId: string,
  companyId: string | null,
  canonicalRole: CanonicalRole
): Promise<string[]> {
  const [user, dbGroup] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { permissions: true },
    }),
    companyId
      ? db.permissionGroup.findFirst({
          where: { companyId, name: canonicalRole },
          select: { permissions: true },
        })
      : Promise.resolve(null),
  ])

  let basePerms: string[] = dbGroup?.permissions ?? []
  if (basePerms.length === 0) {
    const staticGroup = PERMISSION_GROUPS.find(g => g.name === canonicalRole)
    basePerms = staticGroup?.permissions ?? []
  }

  const merged = new Set<string>(basePerms)
  for (const p of user?.permissions ?? []) merged.add(p)
  return Array.from(merged)
}

export async function getSessionCtx(): Promise<SessionCtx | null> {
  const session = await auth()
  if (!session?.user) return null
  const u = session.user as any

  const rawRole: string = u.role ?? "employee"
  const role = normalizeRole(rawRole)
  const companyId: string | null = u.companyId ?? null

  // Invalidate sessions for terminated/locked employees. Without this check,
  // a soft-deleted employee's JWT stays valid until natural expiry (8h per
  // auth.config.ts) — we enforce revocation at every request instead.
  // Boss-admin users (no linked employeeId) bypass this gate by design.
  const employeeId: string | null = u.employeeId ?? null
  if (employeeId) {
    const emp = await db.employee.findUnique({
      where: { id: employeeId },
      select: { deletedAt: true, accountStatus: true },
    })
    if (!emp || emp.deletedAt || emp.accountStatus === "LOCKED") {
      return null
    }
  }

  // Re-resolve permissions from DB every call — do NOT trust JWT cache
  const permissions = await resolvePermissionsForUser(u.id, companyId, role)

  return {
    userId: u.id,
    employeeId,
    companyId,
    rawRole,
    role,
    permissions,
  }
}

export async function requireSession(): Promise<SessionCtx> {
  const ctx = await getSessionCtx()
  if (!ctx) throw new AuthError("Unauthorized", 401)
  return ctx
}

export async function requirePermission(required: string): Promise<SessionCtx> {
  const ctx = await requireSession()
  if (!hasPermission(ctx.permissions, required)) {
    throw new AuthError(`Forbidden: missing ${required}`, 403)
  }
  return ctx
}

export async function requireRole(
  ...roles: CanonicalRole[]
): Promise<SessionCtx> {
  const ctx = await requireSession()
  if (!roles.includes(ctx.role)) {
    throw new AuthError(`Forbidden: requires ${roles.join("/")}`, 403)
  }
  return ctx
}

export function canApproveSalary(ctx: SessionCtx): boolean {
  return ctx.role === "admin"
}

export function canEditPayroll(ctx: SessionCtx): boolean {
  return ctx.role === "admin" || hasPermission(ctx.permissions, "luong.edit")
}
