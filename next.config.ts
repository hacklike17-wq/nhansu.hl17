import type { NextConfig } from "next"

/**
 * Security response headers applied on every Next.js response. Nginx in front
 * may also add headers — these are defence-in-depth at the app layer so that
 * local dev + bare Next runs also get baseline protection.
 *
 * HSTS:
 *   `max-age=63072000` (2 years) + `includeSubDomains` — forces HTTPS at the
 *   browser for the current origin and all subdomains.
 * X-Frame-Options / frame-ancestors:
 *   DENY — blocks this site from being iframed (clickjacking defence). We have
 *   no legitimate iframe embedder.
 * X-Content-Type-Options:
 *   nosniff — browser must respect declared Content-Type, no MIME sniffing.
 * Referrer-Policy:
 *   strict-origin-when-cross-origin — leak only origin cross-site, full path
 *   same-site. Sensible default for an internal tool.
 * Permissions-Policy:
 *   Disable sensors/media APIs we never use.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
