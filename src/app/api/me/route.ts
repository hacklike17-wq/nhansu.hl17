import { NextResponse } from "next/server"
import { getSessionCtx, errorResponse } from "@/lib/permission"

/**
 * GET /api/me — returns the caller's fresh session context
 *
 * Fresh = permissions are re-resolved from DB on every call (not from JWT).
 * Client code should use this as the authoritative source for UI gating
 * because JWT-embedded permissions can go stale after PermissionGroup edits
 * or role reassignment.
 */
export async function GET() {
  try {
    const ctx = await getSessionCtx()
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json(
      {
        userId: ctx.userId,
        employeeId: ctx.employeeId,
        companyId: ctx.companyId,
        role: ctx.role,
        permissions: ctx.permissions,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
