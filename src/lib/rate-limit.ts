/**
 * In-memory per-key rate limiter for login brute-force protection.
 *
 * Keyed by `${ip}:${email}` so a single attacker has to split their budget
 * across every (IP, email) pair separately — vastly slows credential
 * stuffing while rarely hitting legitimate users (who retry from the same
 * IP+email will notice a lockout after MAX_FAILURES and contact support).
 *
 * Storage is a Map on the Node.js process. Sufficient for our threat model:
 *   - pm2 in fork mode = 1 process → shared counter
 *   - pm2 restart wipes memory (resets counters) — acceptable because
 *     attacker can't easily trigger restart, and legit users get a fresh
 *     window after a deploy.
 *
 * If we scale to cluster mode or multi-node, migrate to Redis via
 * @upstash/ratelimit or rate-limiter-flexible.
 */

const MAX_FAILURES = 5
const WINDOW_MS = 10 * 60 * 1000 // 10 minutes

type Entry = { failures: number; resetAt: number }

const attempts = new Map<string, Entry>()

// Periodic cleanup: drop expired entries so the Map doesn't grow forever.
// 5-minute sweep keeps memory bounded under any attack volume.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of attempts) {
      if (entry.resetAt < now) attempts.delete(key)
    }
  }, 5 * 60 * 1000).unref?.()
}

export type RateLimitCheck = {
  allowed: boolean
  remainingAttempts: number
  retryAfterMs?: number
}

export function checkLoginRateLimit(key: string): RateLimitCheck {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || entry.resetAt < now) {
    return { allowed: true, remainingAttempts: MAX_FAILURES }
  }

  if (entry.failures >= MAX_FAILURES) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs: entry.resetAt - now,
    }
  }

  return { allowed: true, remainingAttempts: MAX_FAILURES - entry.failures }
}

export function recordLoginFailure(key: string): void {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { failures: 1, resetAt: now + WINDOW_MS })
  } else {
    entry.failures += 1
    attempts.set(key, entry)
  }
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key)
}
