import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { hasPermission, normalizeRole, type CanonicalRole } from "@/constants/data"

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

export async function getSessionCtx(): Promise<SessionCtx | null> {
  const session = await auth()
  if (!session?.user) return null
  const u = session.user as any
  const rawRole: string = u.role ?? "employee"
  return {
    userId: u.id,
    employeeId: u.employeeId ?? null,
    companyId: u.companyId ?? null,
    rawRole,
    role: normalizeRole(rawRole),
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
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

export function canViewEmployeePayroll(
  ctx: SessionCtx,
  targetEmployeeId: string
): boolean {
  if (ctx.role === "admin") return true
  if (ctx.role === "manager" && hasPermission(ctx.permissions, "luong.view")) return true
  return ctx.role === "employee" && ctx.employeeId === targetEmployeeId
}
