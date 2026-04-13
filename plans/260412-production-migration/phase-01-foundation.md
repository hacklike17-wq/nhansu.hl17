# Phase 01 — Foundation: Prisma, DB Schema, Environment

**Parent:** `plan.md`
**Dependencies:** None (first phase)
**Research refs:** `research/researcher-01-nextjs-prisma-auth.md`, `research/researcher-02-schema-design.md`

---

## Overview

- **Date:** 2026-04-12
- **Description:** Install Prisma, define full PostgreSQL schema, configure environment variables, establish DB client singleton, and write initial migration.
- **Priority:** Critical — all other phases depend on this
- **Implementation status:** Pending
- **Review status:** Draft

---

## Key Insights

- Next.js 16 serverless functions (Vercel) exhaust connection limits fast — PgBouncer or Neon pooler is mandatory in production. Use two env vars: `DATABASE_URL` (direct, for migrations) and `DATABASE_URL_POOL` (pooled, for runtime).
- Prisma `prismaSchemaFolder` feature allows splitting schema across domain files — use it to keep `schema.prisma` readable.
- `Decimal @db.Numeric(15,0)` for VND: never `Float`, never `Int` (overflow risk above 2.1B).
- `companyId` on every table is added now (zero cost), saves future migration pain if multi-tenancy is ever needed.
- `deletedAt` partial index: `@@index([companyId, deletedAt])` — soft-deleted rows never break unique constraints if filtered correctly.
- PITBracket and InsuranceRate must be DB tables, not hardcoded. Tax law changes (PIT reform July 2026) will require data-only updates with no redeploy.

---

## Requirements

1. Prisma ORM installed as production dependency
2. Full schema covering: Company, User, Employee, WorkUnit, DeductionEvent, LeaveRequest, Payroll, RevenueRecord, ExpenseRecord, BudgetRecord, DebtRecord, PITBracket, InsuranceRate, PermissionGroup, AuditLog, SalaryColumn, SalaryValue
3. All enums defined (ContractType, AccountStatus, PayrollStatus, ApprovalStatus, DeductionType, InsuranceType, RevenueCategory, ExpenseCategory, DebtType)
4. DB client singleton (`src/lib/db.ts`) safe for hot-reload in dev
5. Environment variable structure documented with `.env.example`
6. Initial Prisma migration created and committed

---

## Architecture

### Package additions

```json
// dependencies (production — needed at runtime)
"@prisma/client": "^6.x",
"@auth/prisma-adapter": "^2.x"

// devDependencies
"prisma": "^6.x"
```

### File structure

```
prisma/
  schema/
    main.prisma          ← generator + datasource + enums
    auth.prisma          ← User, Account, Session, VerificationToken (Auth.js tables)
    company.prisma       ← Company, CompanySettings
    employee.prisma      ← Employee, Department (future)
    attendance.prisma    ← WorkUnit, DeductionEvent, LeaveRequest
    payroll.prisma       ← Payroll, SalaryColumn, SalaryValue
    finance.prisma       ← RevenueRecord, ExpenseRecord, BudgetRecord, DebtRecord
    config.prisma        ← PITBracket, InsuranceRate, PermissionGroup
    audit.prisma         ← AuditLog
  migrations/
    <timestamp>_init/
      migration.sql
  seed.ts                ← covered in Phase 07

src/lib/
  db.ts                  ← Prisma client singleton
```

### main.prisma

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["prismaSchemaFolder"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_DIRECT")  // for migrations bypassing PgBouncer
}
```

### src/lib/db.ts

```typescript
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"] })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
```

### Environment variables

```bash
# .env.local (dev — direct connection, no pooler)
DATABASE_URL="postgresql://user:pass@localhost:5432/nhansu_hl17"
DATABASE_URL_DIRECT="postgresql://user:pass@localhost:5432/nhansu_hl17"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Production (Neon example)
DATABASE_URL="postgresql://user:pass@ep-xxx.pooler.neon.tech:5432/nhansu_hl17?pgbouncer=true&sslmode=require"
DATABASE_URL_DIRECT="postgresql://user:pass@ep-xxx.neon.tech:5432/nhansu_hl17?sslmode=require"
```

---

## Schema Details

### auth.prisma (Auth.js v5 required tables)

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?   // hashed — only used for Credentials provider
  employeeId    String?   @unique
  companyId     String?
  role          String    @default("employee")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts   Account[]
  sessions   Session[]
  employee   Employee? @relation(fields: [employeeId], references: [id])

  @@index([companyId])
}

model Account {
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([provider, providerAccountId])
}

model Session {
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime
  @@id([identifier, token])
}
```

### employee.prisma (key fields)

Full schema from `researcher-02-schema-design.md` — Employee model with:
- `deletedAt DateTime?` + `@@index([companyId, deletedAt])`
- `baseSalary Decimal @db.Numeric(15,0)`
- `contractType ContractType` (enum)
- `accountStatus AccountStatus` (enum)
- One-to-one relation to `User` via `userId String? @unique`

### attendance.prisma — DeductionEvent with LeaveRequest FK (1:N)

```prisma
model LeaveRequest {
  id               String          @id @default(cuid())
  companyId        String
  employeeId       String
  type             String          // annual, sick, personal, etc.
  startDate        DateTime        @db.Date
  endDate          DateTime        @db.Date
  totalDays        Int
  reason           String?
  status           ApprovalStatus  @default(PENDING)
  approvedBy       String?
  approvedAt       DateTime?
  submittedAt      DateTime        @default(now())

  employee         Employee        @relation(fields: [employeeId], references: [id])
  deductionEvents  DeductionEvent[]  // 1:N — one row per day of leave

  @@index([companyId, employeeId])
  @@index([status])
}

model DeductionEvent {
  id              String          @id @default(cuid())
  companyId       String
  employeeId      String
  leaveRequestId  String?         // FK → LeaveRequest (null for manual deductions)
  date            DateTime        @db.Date
  type            DeductionType
  delta           Decimal         @db.Numeric(4, 2)
  reason          String
  status          ApprovalStatus  @default(PENDING)
  submittedAt     DateTime        @default(now())
  approvedBy      String?
  approvedAt      DateTime?

  employee        Employee        @relation(fields: [employeeId], references: [id])
  leaveRequest    LeaveRequest?   @relation(fields: [leaveRequestId], references: [id])

  @@index([companyId, employeeId, date])
  @@index([leaveRequestId])
  @@index([status])
}
```

**Lý do 1:N:** Một đơn nghỉ phép nhiều ngày (startDate → endDate) tạo ra N DeductionEvent — mỗi ngày một record. Approval của LeaveRequest tạo batch DeductionEvents trong `db.$transaction()`.

### PITBracket + InsuranceRate overlap constraint

Service-level validation trong `settingsService.upsertPITBracket()`:
```typescript
// Trước khi insert/update, kiểm tra overlap
const overlapping = await db.pITBracket.findFirst({
  where: {
    companyId,
    id: { not: data.id },          // bỏ qua chính nó khi update
    validFrom: { lte: data.validTo ?? new Date("9999-12-31") },
    OR: [{ validTo: null }, { validTo: { gte: data.validFrom } }],
    AND: [
      { minIncome: { lt: data.maxIncome } },
      { maxIncome: { gt: data.minIncome } },
    ],
  },
})
if (overlapping) throw new Error("Khung thuế bị chồng chéo với bản ghi hiện có")
```
InsuranceRate: tương tự nhưng thêm `type` filter (chỉ overlap cùng loại BHXH/BHYT/BHTN).

### Soft-delete middleware (in db.ts)

```typescript
db.$use(async (params, next) => {
  const modelsWithSoftDelete = ['Employee']
  if (modelsWithSoftDelete.includes(params.model ?? '')) {
    if (['findMany', 'findFirst', 'findUnique', 'count'].includes(params.action)) {
      params.args.where = { ...params.args.where, deletedAt: null }
    }
    if (params.action === 'delete') {
      params.action = 'update'
      params.args.data = { deletedAt: new Date() }
    }
  }
  return next(params)
})
```

---

## Related Code Files

**New files to create:**
- `prisma/schema/main.prisma`
- `prisma/schema/auth.prisma`
- `prisma/schema/company.prisma`
- `prisma/schema/employee.prisma`
- `prisma/schema/attendance.prisma`
- `prisma/schema/payroll.prisma`
- `prisma/schema/finance.prisma`
- `prisma/schema/config.prisma`
- `prisma/schema/audit.prisma`
- `src/lib/db.ts`
- `.env.example`
- `.env.local` (gitignored)

**Modified files:**
- `package.json` — add prisma, @prisma/client, @auth/prisma-adapter
- `.gitignore` — ensure `.env.local` and `.env` are ignored

---

## Implementation Steps

1. Install dependencies: `npm install @prisma/client @auth/prisma-adapter && npm install -D prisma`
2. `npx prisma init --datasource-provider postgresql` — generates basic structure
3. Enable `prismaSchemaFolder` in generator block; move schema to `prisma/schema/` directory
4. Write all schema files (auth, company, employee, attendance, payroll, finance, config, audit)
5. Add all enums to `main.prisma`
6. Write `src/lib/db.ts` singleton with soft-delete middleware
7. Create `.env.local` with local PostgreSQL credentials; write `.env.example` with placeholder values
8. `npx prisma generate` — verify client generates without errors
9. `npx prisma migrate dev --name init` — creates migration SQL, applies to local DB
10. Spot-check generated migration SQL: confirm `Numeric(15,0)` on all VND fields, correct enum values, all indexes present
11. Add `prisma generate` to `package.json` `postinstall` script for Vercel build compatibility
12. Commit schema + migration (never commit `.env.local`)

---

## Todo List

- [ ] Install Prisma + client + adapter packages
- [ ] Init prisma with schema folder feature
- [ ] Write auth.prisma (User, Account, Session, VerificationToken)
- [ ] Write employee.prisma (Employee + soft delete)
- [ ] Write attendance.prisma (WorkUnit, DeductionEvent, LeaveRequest)
- [ ] Write payroll.prisma (Payroll, SalaryColumn, SalaryValue)
- [ ] Write finance.prisma (Revenue, Expense, Budget, Debt)
- [ ] Write config.prisma (PITBracket, InsuranceRate, PermissionGroup)
- [ ] Write audit.prisma (AuditLog)
- [ ] Write attendance.prisma (WorkUnit, DeductionEvent với leaveRequestId FK, LeaveRequest với 1:N relation)
- [ ] Write src/lib/db.ts with singleton + soft-delete middleware
- [ ] Create .env.example and .env.local
- [ ] Run prisma generate (verify)
- [ ] Run prisma migrate dev --name init
- [ ] Audit migration SQL output
- [ ] Add postinstall script to package.json

---

## Success Criteria

- `npx prisma generate` runs without errors
- `npx prisma migrate dev` applies cleanly to local PostgreSQL
- All VND fields use `numeric(15,0)` in generated SQL
- `db.ts` singleton imports without error in a test API route
- `.env.local` is confirmed gitignored

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Schema changes required mid-migration | High | Medium | Migrations are additive; iterate freely in dev |
| PgBouncer incompatibility with prepared statements | High | High | Add `?pgbouncer=true` to pool URL; Prisma automatically disables prepared statements |
| `prismaSchemaFolder` feature flag removed | Low | Medium | Fall back to single schema.prisma — minor reorganization only |
| Soft-delete middleware breaks explicit `delete` calls | Medium | Medium | Test soft-delete explicitly; add escape hatch for admin hard-delete via raw query |

---

## Security Considerations

- Never commit `.env.local` or `.env` — add both to `.gitignore`
- `DATABASE_URL_DIRECT` for migration bypasses pooler — restrict to CI/CD only
- Soft-delete ensures ex-employees remain in payroll audit trail; hard delete only via manual admin action
- `password` field on User is nullable — prevents accidental plaintext storage if Credentials not configured

---

## Next Steps

Phase 02 (Auth System) unlocks after this phase:
- User table exists for Auth.js adapter
- `db.ts` is importable in auth config
- Session and Account tables present for PgAdapter
