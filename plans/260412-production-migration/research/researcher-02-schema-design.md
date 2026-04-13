# Research: Database Schema Design — Vietnamese HR & Payroll

**Date:** 2026-04-12

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `deletedAt` soft delete | Timestamps enable audit; partial indexes prevent broken unique constraints |
| Separate PITBracket/InsuranceRate tables | Tax rates change annually; store in DB for UI admin without redeployment |
| Prisma middleware audit logs | Simpler than triggers; captures user context; works across tables |
| `Decimal @db.Numeric(15,0)` for VND | No float rounding; 15 digits handles up to 999T VND |
| `companyId` on all tables | Future multi-tenancy without schema migration |
| PostgreSQL enums | Type-safe, smaller storage, DB-level validation |

---

## Vietnamese Payroll Rates (2025)

**Employee insurance contributions:**
- BHXH: 8%, BHYT: 1.5%, BHTN: 1% → **Total: 10.5%**

**Employer contributions (costs not deducted from employee salary):**
- BHXH: 17.5%, BHYT: 3%, BHTN: 1% → **Total: 21.5%**

**PIT Deductions (current):**
- Personal: 11M VND/month (increasing to 15.5M from July 2026)
- Dependent: 4.4M VND/person/month (increasing to 6.2M from July 2026)

**PIT Brackets (current 7-bracket system → transitioning to 5-bracket July 2026):**
Store as `PITBracket` table, not hardcoded.

---

## Core Schema Skeleton (Prisma)

```prisma
// Core entities
model Company {
  id        String    @id @default(cuid())
  name      String
  taxId     String    @unique
  createdAt DateTime  @default(now())
}

model Employee {
  id            String    @id @default(cuid())
  companyId     String
  fullName      String
  email         String
  phone         String?
  dob           DateTime?
  gender        String?
  idCard        String?
  address       String?
  department    String
  position      String
  contractType  ContractType
  startDate     DateTime
  endDate       DateTime?
  baseSalary    Decimal   @db.Numeric(15, 0)
  bankName      String?
  bankAccount   String?
  taxCode       String?
  bhxhCode      String?
  accountEmail  String?
  accountRole   String?
  accountStatus AccountStatus @default(ACTIVE)
  deletedAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  workUnits     WorkUnit[]
  deductions    DeductionEvent[]
  payrolls      Payroll[]
  leaveRequests LeaveRequest[]
  
  @@unique([companyId, email], map: "unique_active_email") 
  @@index([companyId, deletedAt])
  @@index([department])
}

model WorkUnit {
  id          String    @id @default(cuid())
  companyId   String
  employeeId  String
  date        DateTime  @db.Date
  units       Decimal   @db.Numeric(4, 2) @default(1.0)
  note        String?
  createdAt   DateTime  @default(now())
  
  employee    Employee  @relation(fields: [employeeId], references: [id])
  
  @@unique([employeeId, date])
  @@index([companyId, date])
}

model DeductionEvent {
  id          String    @id @default(cuid())
  companyId   String
  employeeId  String
  date        DateTime  @db.Date
  type        DeductionType
  delta       Decimal   @db.Numeric(4, 2)   // -1.0, -0.25, +0.25
  reason      String
  status      ApprovalStatus @default(PENDING)
  submittedAt DateTime  @default(now())
  approvedBy  String?
  approvedAt  DateTime?
  
  employee    Employee  @relation(fields: [employeeId], references: [id])
  
  @@index([companyId, employeeId, date])
  @@index([status])
}

model Payroll {
  id              String    @id @default(cuid())
  companyId       String
  employeeId      String
  month           DateTime  @db.Date   // First day of month e.g. 2026-04-01
  congSoNhan      Decimal   @db.Numeric(6, 2)
  congSoTru       Decimal   @db.Numeric(6, 2)
  netWorkUnits    Decimal   @db.Numeric(6, 2)
  baseSalary      Decimal   @db.Numeric(15, 0)
  kpiBonus        Decimal   @db.Numeric(15, 0) @default(0)
  overtimePay     Decimal   @db.Numeric(15, 0) @default(0)
  bonus           Decimal   @db.Numeric(15, 0) @default(0)
  grossSalary     Decimal   @db.Numeric(15, 0)
  bhxhEmployee    Decimal   @db.Numeric(15, 0)
  bhytEmployee    Decimal   @db.Numeric(15, 0)
  bhtnEmployee    Decimal   @db.Numeric(15, 0)
  pitTax          Decimal   @db.Numeric(15, 0)
  otherDeductions Decimal   @db.Numeric(15, 0) @default(0)
  netSalary       Decimal   @db.Numeric(15, 0)
  status          PayrollStatus @default(DRAFT)
  approvedBy      String?
  approvedAt      DateTime?
  paidAt          DateTime?
  note            String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  employee        Employee  @relation(fields: [employeeId], references: [id])
  
  @@unique([employeeId, month])
  @@index([companyId, month])
  @@index([status])
}

// Financial modules
model RevenueRecord {
  id          String    @id @default(cuid())
  companyId   String
  date        DateTime  @db.Date
  customer    String
  category    RevenueCategory
  amount      Decimal   @db.Numeric(15, 0)
  invoiceNo   String?
  paymentMethod String?
  note        String?
  createdAt   DateTime  @default(now())
  
  @@index([companyId, date])
}

model ExpenseRecord {
  id          String    @id @default(cuid())
  companyId   String
  date        DateTime  @db.Date
  category    ExpenseCategory
  department  String?
  amount      Decimal   @db.Numeric(15, 0)
  description String
  status      ApprovalStatus @default(PENDING)
  approvedBy  String?
  createdAt   DateTime  @default(now())
  
  @@index([companyId, date])
}

model BudgetRecord {
  id          String    @id @default(cuid())
  companyId   String
  period      DateTime  @db.Date
  category    String
  department  String?
  planned     Decimal   @db.Numeric(15, 0)
  actual      Decimal   @db.Numeric(15, 0) @default(0)
  
  @@unique([companyId, period, category, department])
}

model DebtRecord {
  id          String    @id @default(cuid())
  companyId   String
  type        DebtType
  company     String
  amount      Decimal   @db.Numeric(15, 0)
  dueDate     DateTime  @db.Date
  status      String
  isPaidOff   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  
  @@index([companyId, dueDate])
}

// Config / rates tables
model PITBracket {
  id        String    @id @default(cuid())
  companyId String
  minIncome Decimal   @db.Numeric(15, 0)
  maxIncome Decimal   @db.Numeric(15, 0)
  rate      Decimal   @db.Numeric(4, 3)
  validFrom DateTime
  validTo   DateTime?
  
  @@index([companyId, validFrom])
}

model InsuranceRate {
  id           String    @id @default(cuid())
  companyId    String
  type         InsuranceType
  employeeRate Decimal   @db.Numeric(4, 3)
  employerRate Decimal   @db.Numeric(4, 3)
  validFrom    DateTime
  validTo      DateTime?
}

// Permissions
model PermissionGroup {
  id          String    @id @default(cuid())
  companyId   String
  name        String
  permissions String[]  // PostgreSQL text array
  isSystem    Boolean   @default(false)
  
  @@unique([companyId, name])
}

// Audit
model AuditLog {
  id          String    @id @default(cuid())
  companyId   String
  entityType  String
  entityId    String
  action      String    // CREATE, UPDATE, APPROVE, DELETE
  changedBy   String?
  changes     Json?
  createdAt   DateTime  @default(now())
  
  @@index([companyId, entityType, entityId])
  @@index([changedBy, createdAt])
}

// Enums
enum ContractType {
  FULL_TIME
  PART_TIME
  INTERN
  FREELANCE
}

enum AccountStatus {
  ACTIVE
  LOCKED
  NO_ACCOUNT
}

enum PayrollStatus {
  DRAFT
  PENDING
  APPROVED
  PAID
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

enum DeductionType {
  NGHI_NGAY
  DI_MUON
  OVERTIME
}

enum InsuranceType {
  BHXH
  BHYT
  BHTN
}

enum RevenueCategory {
  PRODUCT
  SERVICE
  CONSULTING
  INVESTMENT
  OTHER
}

enum ExpenseCategory {
  SALARY
  RENT
  UTILITIES
  MARKETING
  EQUIPMENT
  TRAVEL
  INSURANCE
  TAX
  OTHER
}

enum DebtType {
  RECEIVABLE
  PAYABLE
}
```

---

## Soft Delete Pattern

```typescript
// Prisma middleware — auto-filter deleted employees
prisma.$use(async (params, next) => {
  if (params.model === 'Employee') {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = { ...params.args.where, deletedAt: null }
    }
  }
  return next(params)
})
```

---

## Unresolved Questions

1. Should salary formula be stored as computed columns or flexible JSON rules per company?
2. Does approval workflow require multiple levels (manager → accountant → director)?
3. `LeaveRequest` model needed separately, or merge with `DeductionEvent`?
4. CashflowItem: derive from Revenue+Expense or maintain separate transaction log?

---

## Sources
- Prisma Deep-Dive Handbook 2025
- Acclime Vietnam HR & Payroll Guide
- Vietnamese PIT 2026 Updates
- Prisma Soft Delete Middleware (official)
- Multi-Tenant Patterns (ZenStack)
