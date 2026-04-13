-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERN', 'FREELANCE');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'LOCKED', 'NO_ACCOUNT');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeductionType" AS ENUM ('NGHI_NGAY', 'DI_MUON', 'VE_SOM', 'OVERTIME');

-- CreateEnum
CREATE TYPE "InsuranceType" AS ENUM ('BHXH', 'BHYT', 'BHTN');

-- CreateEnum
CREATE TYPE "RevenueCategory" AS ENUM ('PRODUCT', 'SERVICE', 'CONSULTING', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SALARY', 'RENT', 'UTILITIES', 'MARKETING', 'EQUIPMENT', 'TRAVEL', 'INSURANCE', 'TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'UNPAID', 'WEDDING', 'BEREAVEMENT');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('WORKING', 'HALF', 'LEAVE', 'REMOTE', 'RESIGNED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employeeId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "director" TEXT,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "logo" TEXT,
    "foundedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workHoursPerDay" INTEGER NOT NULL DEFAULT 8,
    "workDaysPerWeek" INTEGER NOT NULL DEFAULT 5,
    "overtimeRate" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
    "holidayRate" DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    "leavePerYear" INTEGER NOT NULL DEFAULT 12,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "locale" TEXT NOT NULL DEFAULT 'vi-VN',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "dob" DATE,
    "gender" TEXT,
    "idCard" TEXT,
    "address" TEXT,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'WORKING',
    "contractType" "ContractType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "baseSalary" DECIMAL(15,0) NOT NULL,
    "responsibilitySalary" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "taxCode" TEXT,
    "bhxhCode" TEXT,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_units" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "units" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deduction_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveRequestId" TEXT,
    "date" DATE NOT NULL,
    "type" "DeductionType" NOT NULL,
    "delta" DECIMAL(4,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "deduction_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_violations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "types" TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "congSoNhan" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "congSoTru" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "netWorkUnits" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "baseSalary" DECIMAL(15,0) NOT NULL,
    "kpiBonus" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "overtimePay" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "grossSalary" DECIMAL(15,0) NOT NULL,
    "bhxhEmployee" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bhytEmployee" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bhtnEmployee" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "pitTax" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(15,0) NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_columns" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'number',
    "formula" TEXT,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_values" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "columnKey" TEXT NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "customer" TEXT NOT NULL,
    "description" TEXT,
    "category" "RevenueCategory" NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "invoiceNo" TEXT,
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vendor" TEXT,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "department" TEXT,
    "amount" DECIMAL(15,0) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "receiptNo" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "department" TEXT,
    "planned" DECIMAL(15,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DebtType" NOT NULL,
    "company" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "amount" DECIMAL(15,0) NOT NULL,
    "paid" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'current',
    "isPaidOff" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pit_brackets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "minIncome" DECIMAL(15,0) NOT NULL,
    "maxIncome" DECIMAL(15,0),
    "rate" DECIMAL(5,4) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,

    CONSTRAINT "pit_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_rates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "InsuranceType" NOT NULL,
    "employeeRate" DECIMAL(5,4) NOT NULL,
    "employerRate" DECIMAL(5,4) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,

    CONSTRAINT "insurance_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_groups" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "permissions" TEXT[],
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" TEXT,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "companies_taxId_key" ON "companies"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

-- CreateIndex
CREATE INDEX "employees_companyId_deletedAt_idx" ON "employees"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_email_key" ON "employees"("companyId", "email");

-- CreateIndex
CREATE INDEX "work_units_companyId_date_idx" ON "work_units"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "work_units_employeeId_date_key" ON "work_units"("employeeId", "date");

-- CreateIndex
CREATE INDEX "leave_requests_companyId_employeeId_idx" ON "leave_requests"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "deduction_events_companyId_employeeId_date_idx" ON "deduction_events"("companyId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "deduction_events_leaveRequestId_idx" ON "deduction_events"("leaveRequestId");

-- CreateIndex
CREATE INDEX "deduction_events_status_idx" ON "deduction_events"("status");

-- CreateIndex
CREATE INDEX "overtime_entries_companyId_employeeId_date_idx" ON "overtime_entries"("companyId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "kpi_violations_companyId_employeeId_date_idx" ON "kpi_violations"("companyId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "payrolls_companyId_month_idx" ON "payrolls"("companyId", "month");

-- CreateIndex
CREATE INDEX "payrolls_status_idx" ON "payrolls"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_employeeId_month_key" ON "payrolls"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "salary_columns_companyId_key_key" ON "salary_columns"("companyId", "key");

-- CreateIndex
CREATE INDEX "salary_values_companyId_month_idx" ON "salary_values"("companyId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "salary_values_employeeId_month_columnKey_key" ON "salary_values"("employeeId", "month", "columnKey");

-- CreateIndex
CREATE INDEX "revenue_records_companyId_date_idx" ON "revenue_records"("companyId", "date");

-- CreateIndex
CREATE INDEX "expense_records_companyId_date_idx" ON "expense_records"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "budget_records_companyId_period_category_department_key" ON "budget_records"("companyId", "period", "category", "department");

-- CreateIndex
CREATE INDEX "debt_records_companyId_dueDate_idx" ON "debt_records"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "pit_brackets_companyId_validFrom_idx" ON "pit_brackets"("companyId", "validFrom");

-- CreateIndex
CREATE INDEX "insurance_rates_companyId_type_validFrom_idx" ON "insurance_rates"("companyId", "type", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "permission_groups_companyId_name_key" ON "permission_groups"("companyId", "name");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_entityType_entityId_idx" ON "audit_logs"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_changedBy_createdAt_idx" ON "audit_logs"("changedBy", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_units" ADD CONSTRAINT "work_units_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deduction_events" ADD CONSTRAINT "deduction_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deduction_events" ADD CONSTRAINT "deduction_events_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_violations" ADD CONSTRAINT "kpi_violations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_values" ADD CONSTRAINT "salary_values_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
