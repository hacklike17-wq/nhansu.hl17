# Deployment Guide

**Project:** ADMIN_HL17 — nhansu.hl17
**Last Updated:** 2026-04-13

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (with pooling if using Neon/PgBouncer) |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret — minimum 32 bytes |
| `NEXTAUTH_URL` | Production only | Full public URL (e.g., `https://nhansu.hl17.com`) |
| `AI_ENCRYPTION_KEY` | Required for AI | 64 hex chars (32 bytes) — encrypts stored OpenAI API keys at rest |
| `CRON_SECRET` | Required for attendance cron | 64 hex chars — Bearer token for `POST /api/cron/auto-fill-attendance` |

Generate `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

Generate `AI_ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important — `AI_ENCRYPTION_KEY` rotation:** changing this value after an API key has been stored in `ai_config` will make every stored key unreadable (AES-256-GCM ciphertext is bound to the key). The admin must navigate to `/caidat` → "Trợ lý AI" and re-enter the OpenAI API key after rotation. Treat this variable with the same care as `NEXTAUTH_SECRET`. The OpenAI SDK (`openai` npm package) must be installed — it is a production dependency bundled with the app, not a dev-only dependency.

Generate `CRON_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Daily Attendance Cron (VPS setup)

The app auto-creates a default `WorkUnit` row (1 công) for each active employee every working day so employees see today's attendance on the dashboard even if a manager hasn't opened `/chamcong`. The endpoint is idempotent — safe to re-run.

**Endpoint:** `POST /api/cron/auto-fill-attendance`
**Auth:** `Authorization: Bearer <CRON_SECRET>`
**Schedule:** daily at 18:00 Asia/Ho_Chi_Minh, Mon–Sat (the endpoint no-ops on Sunday internally too, so a 7-day schedule is also fine)
**Behavior:**
  - Skips employees whose current-month payroll is no longer DRAFT
  - Skips dates already covered by an existing WorkUnit row
  - Creates `units=0` + leave note for employees on APPROVED UNPAID leave
  - Triggers `recalculateMonth()` fire-and-forget so DRAFT payrolls stay in sync

### Option A — Systemd timer (recommended on a real VPS)

Create `/etc/systemd/system/nhansu-autofill.service`:
```ini
[Unit]
Description=Nhansu daily auto-fill attendance

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -sS -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  https://your-domain.com/api/cron/auto-fill-attendance
EnvironmentFile=/etc/nhansu-cron.env
```

Put the secret in `/etc/nhansu-cron.env` (chmod 600, root-owned):
```
CRON_SECRET=<paste the same value from the app's .env>
```

Create `/etc/systemd/system/nhansu-autofill.timer`:
```ini
[Unit]
Description=Run nhansu auto-fill daily at 18:00 VN

[Timer]
OnCalendar=Mon..Sat 18:00 Asia/Ho_Chi_Minh
Persistent=true
Unit=nhansu-autofill.service

[Install]
WantedBy=timers.target
```

Enable + start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nhansu-autofill.timer
sudo systemctl list-timers | grep nhansu   # verify next run time
```

### Option B — Crontab (simpler if systemd not available)

If the VPS is UTC (11:00 UTC = 18:00 VN):
```cron
0 11 * * 1-6 curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/auto-fill-attendance >> /var/log/nhansu-cron.log 2>&1
```

Put the secret in the crontab user's environment (`crontab -e`):
```
CRON_SECRET=<paste the same value>
0 11 * * 1-6 curl ...
```

If the VPS is in Asia/Ho_Chi_Minh local time, use `0 18 * * 1-6` instead.

### Option C — Vercel Cron (if deploying on Vercel)

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/auto-fill-attendance", "schedule": "0 11 * * 1-6" }
  ]
}
```

Vercel invokes the endpoint via GET by default — the route uses POST, so either wrap in a thin GET handler or configure the cron as a POST via Vercel's UI. Vercel automatically injects `Authorization: Bearer $CRON_SECRET` if you set `CRON_SECRET` in the Vercel project environment.

### Manual smoke test
```bash
curl -i -X POST https://your-domain.com/api/cron/auto-fill-attendance \
  -H "Authorization: Bearer $CRON_SECRET"
```
Expected 200 JSON with `companiesProcessed`, `totalCreated`, `totalSkipped`, and a per-company `results[]` array. A 401 means the header or secret is wrong; a 500 means `CRON_SECRET` env var is unset on the server.

For Neon serverless (production), use the pooler connection string for `DATABASE_URL` and optionally set `DATABASE_URL_DIRECT` (non-pooled) for migrations.

---

## Local Development

```bash
# 1. Install
npm install

# 2. Create .env.local
DATABASE_URL="postgresql://postgres:password@localhost:5432/nhansu_hl17"
NEXTAUTH_SECRET="dev-secret-min-32-chars-padding-here"

# 3. Set up database
npm run db:migrate    # prisma migrate dev (creates DB if needed)
npm run db:seed       # seed initial data

# 4. Start
npm run dev           # http://localhost:3000
```

---

## Production Deployment (Vercel + Neon)

### 1. Database Setup (Neon)

1. Create project at [neon.tech](https://neon.tech)
2. Copy the **pooler** connection string for `DATABASE_URL`
3. Copy the **direct** (non-pooled) connection string for migrations

### 2. Vercel Setup

1. Import repository from GitHub
2. Set environment variables in Vercel Dashboard:
   - `DATABASE_URL` — Neon pooler URL
   - `NEXTAUTH_SECRET` — generated secret
   - `NEXTAUTH_URL` — production URL (e.g., `https://your-app.vercel.app`)

3. Set build command:
   ```
   prisma migrate deploy && next build
   ```

   Or configure in `vercel.json`:
   ```json
   {
     "buildCommand": "prisma migrate deploy && next build"
   }
   ```

4. `prisma generate` runs automatically via the `postinstall` script in `package.json`

### 3. First Deployment

After first deploy, seed initial data via a one-time script or Prisma Studio:

```bash
# DO NOT run db:seed in production (no production guard currently)
# Instead, insert initial data manually via Prisma Studio or SQL

# Connect to Neon DB
npx prisma studio --schema prisma/schema.prisma
```

Warning: `prisma/seed.ts` does not currently have a production guard. Do not run `npm run db:seed` against production.

---

## Database Commands Reference

```bash
npm run db:migrate    # prisma migrate dev — applies pending migrations (creates new migration if needed)
npm run db:seed       # npx ts-node prisma/seed.ts — seed data (development only)
npm run db:reset      # prisma migrate reset --force — drop and recreate DB (destructive!)
```

## Schema Strategy: `db push`, not `migrate deploy`

**Important** — this project does NOT use `prisma migrate deploy` as its
production rollout mechanism. The `prisma/migrations/` folder contains only a
3-file baseline captured during initial development. Subsequent schema changes
(Phase 6 calc modes, Phase 08 versioning, salary line-item entries, the AI
assistant tables) were added via direct SQL / `prisma db execute` in dev and
never committed as proper migration files — so running `prisma migrate deploy`
against a fresh database leaves the schema missing columns, enums, and tables.

Until we reset the migration baseline (one-time cleanup, tracked separately),
deployments sync the schema via:

```bash
npx prisma db push --accept-data-loss
```

`db push` reads `schema.prisma` and issues DDL to make the target database
match it. Idempotent, so re-running is safe. `--accept-data-loss` is required
because `db push` conservatively refuses to drop a column by default — if a
future schema change removes a column, review the diff carefully before
deploying.

The VPS `deploy.sh` script already runs `db push`. See
`/var/www/nhansu/deploy.sh` on the server.

---

## Prisma Client Generation

The `postinstall` script runs `prisma generate` automatically. Client is generated to `src/generated/prisma/`. If you modify `schema.prisma`, regenerate manually:

```bash
npx prisma generate
```

---

## Health Check

After deployment, verify:
1. `GET /api/auth/session` returns `{}` (unauthenticated) — Auth.js is responding
2. `GET /login` renders without error
3. Login with a seeded user account works
4. `GET /api/payroll?month=YYYY-MM` (authenticated) returns array

---

## Rollback

To roll back a migration:
```bash
# Revert last migration (development only)
npx prisma migrate reset

# For production: restore from Neon point-in-time backup
# Neon Dashboard → Project → Restore to point in time
```
