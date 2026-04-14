/**
 * Unified client-side API helper (Phase 3 refactor).
 *
 * Before: every hook rolled its own `fetch(...).then(res => {
 *   if (!res.ok) throw new Error(await res.text())
 *   return res.json()
 * })`. Callers then had to `JSON.parse(e.message)` at the UI layer to
 * recover a human-readable error string — see chamcong/page.tsx's
 * `formatSaveError` for an example. Shapes and error handling drifted.
 *
 * After: every mutation goes through `apiFetch`, which:
 *   1. sends the request (adds JSON Content-Type automatically when a body
 *      is present, unless the caller already set one)
 *   2. parses the response body once (JSON if possible, else raw text)
 *   3. on !res.ok, extracts the error message from `{ error }` (or the raw
 *      body) and throws an `ApiError` with a clean `.message` + `.status`
 *   4. returns the parsed success body, typed via the generic
 *
 * This keeps the *payload* semantics identical to the old pattern — the
 * parsed JSON is still what the caller gets on success — while erasing the
 * "message is a JSON blob" footgun in error branches.
 *
 * Backwards compatible with any catch block that does
 * `JSON.parse(e.message)`: JSON.parse on a plain error string throws, the
 * try/catch falls through, and the callsite keeps the raw string as-is.
 */

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (body == null) return fallback
  if (typeof body === "string") return body || fallback
  if (typeof body === "object") {
    const e = (body as { error?: unknown }).error
    if (typeof e === "string" && e.length > 0) return e
    if (e && typeof e === "object") {
      // zod .flatten() shape — { formErrors: [...], fieldErrors: {...} }
      const formErrors = (e as { formErrors?: unknown }).formErrors
      if (Array.isArray(formErrors) && typeof formErrors[0] === "string") {
        return formErrors[0]
      }
      try {
        return JSON.stringify(e)
      } catch {
        return fallback
      }
    }
  }
  return fallback
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const raw = await res.text()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Low-level fetch wrapper. Use this from hook mutation functions; component
 * code should prefer the typed hook exports.
 */
export async function apiFetch<T = unknown>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(url, { ...init, headers })
  const body = await parseResponseBody(res)

  if (!res.ok) {
    const msg = extractErrorMessage(
      body,
      res.statusText || `HTTP ${res.status}`
    )
    throw new ApiError(msg, res.status, body)
  }

  return body as T
}
