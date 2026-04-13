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

Generate `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

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

For production migration deployment:
```bash
npx prisma migrate deploy   # applies pending migrations without creating new ones (safe for production)
```

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
