import { timingSafeEqual } from "crypto"

/**
 * Validate the `Authorization: Bearer <token>` header against `CRON_SECRET`
 * env var using a **constant-time** comparison to neutralize timing-oracle
 * attacks. All cron endpoints should route through this helper instead of
 * doing `!==` directly.
 *
 * Returns:
 *   - { ok: true } when the token matches.
 *   - { ok: false, reason } on any failure path.
 */
export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: "MISSING_SECRET" | "MISSING_HEADER" | "MALFORMED" | "MISMATCH" }

export function verifyCronAuth(authHeader: string | null): CronAuthResult {
  const expected = process.env.CRON_SECRET
  if (!expected) return { ok: false, reason: "MISSING_SECRET" }

  const header = authHeader ?? ""
  if (!header.startsWith("Bearer ")) return { ok: false, reason: "MISSING_HEADER" }

  const provided = header.slice(7)

  // timingSafeEqual requires equal-length buffers; length mismatch returns
  // false without any comparison happening. We pad the shorter buffer to
  // prevent it from leaking the expected length via exception paths.
  const expBuf = Buffer.from(expected, "utf8")
  const provBuf = Buffer.from(provided, "utf8")
  if (expBuf.length !== provBuf.length) {
    // Still run a timingSafeEqual against a same-length dummy so this branch
    // takes roughly the same time as the match-length branch.
    timingSafeEqual(expBuf, Buffer.alloc(expBuf.length))
    return { ok: false, reason: "MALFORMED" }
  }

  return timingSafeEqual(expBuf, provBuf) ? { ok: true } : { ok: false, reason: "MISMATCH" }
}
