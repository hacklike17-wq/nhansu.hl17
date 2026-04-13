# Phase 08 — Deployment: Vercel, Neon/Supabase, Environment, CI/CD

**Parent:** `plan.md`
**Dependencies:** All prior phases complete; `npm run build` passes locally
**Research refs:** `research/researcher-01-nextjs-prisma-auth.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Deploy the production-ready application to Vercel with a managed PostgreSQL database (Neon recommended). Configure connection pooling, environment variables, GitHub Actions CI, and post-deploy verification.
- **Priority:** Medium
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- **Neon vs Supabase:** Neon is recommended — serverless branching (useful for staging), built-in connection pooler (PgBouncer-compatible at port 5432 vs direct at 5433), generous free tier, native Vercel integration. Supabase is viable but Neon's serverless architecture better matches Vercel's ephemeral functions.
- **Two DATABASE_URL pattern is mandatory for Prisma on Vercel:**
  - `DATABASE_URL` → pooled URL (PgBouncer, adds `?pgbouncer=true`) — used at runtime
  - `DATABASE_URL_DIRECT` → direct URL (bypasses pooler) — used by `prisma migrate deploy` in CI
  - Without this split, migrations fail because PgBouncer disables prepared statements (required by Prisma Migrate)
- **Prisma must be in `dependencies` (not devDependencies)** — Vercel build needs `@prisma/client`; `prisma` CLI should also be in dependencies for `prisma generate` to run in `postinstall`
- **`prisma generate` in postinstall** — Vercel doesn't cache `node_modules/.prisma`; regenerate on every deploy
- **`prisma migrate deploy` in CI (not `migrate dev`)** — `migrate dev` prompts interactively, unsafe in CI
- Next.js 16 with App Router on Vercel: all Route Handlers default to dynamic (correct); Server Components with `"use cache"` use Vercel's Edge Cache automatically
- Environment variables containing secrets must be set via Vercel Dashboard (not committed) — use Vercel CLI for bulk import: `vercel env pull`

---

## Requirements

1. Production PostgreSQL database provisioned (Neon)
2. Vercel project linked to GitHub repo
3. All environment variables set in Vercel Dashboard
4. `prisma migrate deploy` runs in Vercel build or GitHub Actions
5. Seed script runs once manually after first deploy (not on every deploy)
6. GitHub Actions CI: lint + type-check + build on every PR
7. Preview deployments for PR branches with separate Neon database branch
8. Custom domain configured (if applicable)

---

## Architecture

### Recommended stack

```
Hosting:    Vercel (Hobby or Pro plan)
Database:   Neon Serverless PostgreSQL
  - Production branch: main
  - Preview branch: per-PR (Neon branching feature)
CDN/Cache:  Vercel Edge Network (automatic for Next.js)
Auth:       Auth.js v5 DB sessions stored in Neon (same DB)
Email:      Not required initially (Credentials provider only)
```

### Environment variables (Vercel Dashboard)

```bash
# Database — Production
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech:5432/nhansu_hl17?pgbouncer=true&sslmode=require"
DATABASE_URL_DIRECT="postgresql://user:pass@ep-xxx.neon.tech:5432/nhansu_hl17?sslmode=require"

# Auth.js
NEXTAUTH_SECRET="<generated 32-byte secret>"
NEXTAUTH_URL="https://nhansu.hl17.com"  # or Vercel domain

# App
NODE_ENV="production"
```

### package.json scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:seed": "npx ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
    "db:studio": "prisma studio",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^6.x",
    "prisma": "^6.x"  // moved from devDependencies
  }
}
```

### Vercel build configuration (vercel.json)

```json
{
  "buildCommand": "prisma migrate deploy && next build",
  "framework": "nextjs"
}
```

Note: `prisma migrate deploy` uses `DATABASE_URL_DIRECT` (set via `directUrl` in schema datasource) to bypass pooler for migrations.

### GitHub Actions CI (.github/workflows/ci.yml)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_CI }}
          DATABASE_URL_DIRECT: ${{ secrets.DATABASE_URL_CI }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
          NEXTAUTH_URL: "http://localhost:3000"
```

Note: CI database can be a separate Neon branch or a local PostgreSQL service container. The build step needs a valid schema to generate Prisma client.

### Neon setup steps

1. Create Neon project at console.neon.tech
2. Note connection strings (pooled + direct)
3. Enable PgBouncer at port 5432 (default in Neon)
4. Create `nhansu_hl17` database
5. For preview deployments: use Neon branching API or Vercel Neon integration (auto-creates branch per PR)

### Post-deploy checklist

```bash
# Run once after first production deploy
# Via Vercel CLI or local with production DATABASE_URL_DIRECT
npx prisma db seed

# Verify DB state
npx prisma studio  # browse tables visually

# Smoke test
curl https://your-domain.vercel.app/api/auth/session  # should return {}
# Login via browser, verify session cookie set
```

---

## Related Code Files

**New files:**
- `vercel.json`
- `.github/workflows/ci.yml`

**Modified:**
- `package.json` — move `prisma` to dependencies, add `postinstall`, add `typecheck` script
- `prisma/schema/main.prisma` — confirm `directUrl = env("DATABASE_URL_DIRECT")`

---

## Implementation Steps

1. Move `prisma` from devDependencies to dependencies in `package.json`
2. Add `"postinstall": "prisma generate"` to scripts
3. Add `"typecheck": "tsc --noEmit"` script
4. Confirm `main.prisma` datasource has `directUrl = env("DATABASE_URL_DIRECT")`
5. Create Neon project; provision `nhansu_hl17` database
6. Copy pooled URL + direct URL from Neon console
7. Create Vercel project; link to GitHub repo; set framework to Next.js
8. Add all environment variables in Vercel Dashboard (DATABASE_URL, DATABASE_URL_DIRECT, NEXTAUTH_SECRET, NEXTAUTH_URL)
9. Write `vercel.json` with `buildCommand: "prisma migrate deploy && next build"`
10. Push to main → Vercel triggers build → monitor build logs
11. Confirm `prisma migrate deploy` completes (check for migration success message)
12. Run seed script once manually against production DB: `DATABASE_URL_DIRECT=<prod-direct-url> npm run db:seed`
13. Write `.github/workflows/ci.yml`; add `DATABASE_URL_CI` secret to GitHub Actions
14. Open test PR → verify CI passes
15. Test Neon Preview Branch: connect Neon integration in Vercel → PRs get isolated DB branch

---

## Todo List

- [ ] Move prisma to production dependencies
- [ ] Add postinstall + typecheck scripts
- [ ] Confirm directUrl in schema
- [ ] Create Neon project + database
- [ ] Create Vercel project + link GitHub
- [ ] Set environment variables in Vercel Dashboard
- [ ] Write vercel.json
- [ ] Push to main and monitor first Vercel build
- [ ] Run db seed against production (once)
- [ ] Verify login works in production
- [ ] Write .github/workflows/ci.yml
- [ ] Add CI secrets to GitHub
- [ ] Test PR CI pipeline
- [ ] (Optional) Configure Neon Preview Branches for PRs

---

## Success Criteria

- `vercel build` completes without errors
- `prisma migrate deploy` runs successfully in build
- Production login works with seeded credentials
- All 16 pages render correctly in production
- GitHub Actions CI passes on PR
- No `localStorage` errors in browser console
- Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| PgBouncer breaks Prisma migrations | High | High | Use `DATABASE_URL_DIRECT` for `migrate deploy`; confirmed Neon supports this |
| Vercel timeout on migration step | Low | Medium | Migrations run in build (not serverless function) — no timeout issue |
| Neon connection limit hit under load | Medium | Medium | Neon pooler handles connection multiplexing; upgrade plan if >50 concurrent users |
| NEXTAUTH_URL wrong in production | High | High | Set to exact Vercel domain URL; test callback URL after deploy |
| Prisma client not generated on Vercel | Medium | High | `postinstall: prisma generate` ensures regeneration on every deploy |

---

## Security Considerations

- `DATABASE_URL_DIRECT` must never be exposed to client — Vercel server-side env vars only
- `NEXTAUTH_SECRET` rotation: if compromised, rotate in Vercel Dashboard + invalidate all sessions (delete Session table rows)
- Enable Vercel's "Environment Variables" encryption at rest (default)
- Set Vercel project to "Private" (require auth on preview deployments) to prevent public access to staging data
- Neon: enable connection SSL (`sslmode=require`) — already in URL template above
- Review Vercel's WAF options post-launch for rate limiting on `/api/auth/callback/credentials`

---

## Next Steps

No further phases — system is in production. Ongoing:
- Monitor Vercel Analytics + Function execution times
- Monitor Neon connection usage dashboard
- Add Vercel Cron if background payroll generation is needed monthly
- July 2026: update PITBracket + personal deduction allowance via Settings UI (no redeploy)
