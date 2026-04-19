/* ─── Navigation ─── */
export type NavItem = {
  label: string
  href: string
  icon: string
  badge?: { text: string; variant: 'red' | 'amber' | 'blue' }
}

/* ─── Dashboard ─── */
export type KpiData = {
  label: string
  value: string
  delta: string
  deltaType: 'up' | 'down' | 'warn'
  period: string
  accent: string
  iconBg: string
}

export type BudgetItem = {
  label: string
  pct: number
  color: string
}

/* ─── Auth / Permissions ─── */
export type UserRole = 'admin' | 'manager' | 'employee'

export type PermissionGroup = {
  id: string
  name: string
  label: string
  permissions: string[]
  description: string
  isSystem: boolean
}

export type AuthUser = {
  employeeId: string
  name: string
  email: string
  accountEmail: string
  role: UserRole
  permissions: string[]
  lastLogin: string
}

/* ─── Departments ─── */
export type Department = {
  id: string
  name: string
  code: string
  managerId: string
  managerName: string
  headcount: number
  budget: number
  color: string
}

/* ─── Employees ─── */
export type Employee = {
  id: string
  code: string
  name: string
  email: string
  phone: string
  department: string
  departmentId: string
  deptColor: string
  position: string
  role: string
  status: 'working' | 'half' | 'leave' | 'remote' | 'resigned'
  joinDate: string
  salary: number
  responsibilitySalary: number
  bankAccount: string
  bankName: string
  taxCode: string
  socialInsurance: string
  address: string
  dob: string
  gender: 'male' | 'female'
  hours: string
  contractType: 'fulltime' | 'parttime' | 'intern' | 'freelance'
  contractEnd?: string
  /* Account */
  accountEmail: string
  accountPassword: string
  accountRole: UserRole
  accountPermissions: string[]
  accountStatus: 'active' | 'locked' | 'no_account'
}

/* ─── Work Units (Công số nhận) ─── */
export type WorkUnit = {
  id: string
  employeeId: string
  employeeName: string
  date: string
  units: number
  note: string
}

/* ─── Deduction Events (Công số trừ) ─── */
export type DeductionEvent = {
  id: string
  employeeId: string
  employeeName: string
  date: string
  type: 'nghi_ngay' | 'di_muon' | 've_som' | 'overtime'
  delta: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  approvedBy?: string
  approvedAt?: string
}

/* ─── Attendance ─── */
export type AttendanceRecord = {
  id: string
  employeeId: string
  employeeName: string
  department: string
  date: string
  checkIn: string
  checkOut: string
  status: 'on_time' | 'late' | 'early_leave' | 'absent' | 'leave' | 'remote'
  overtime: number
  note: string
}

/* ─── Salary ─── */
export type SalaryRecord = {
  id: string
  employeeId: string
  employeeName: string
  department: string
  month: string
  baseSalary: number
  kpiAttendance: number
  kpiPerformance: number
  overtimePay: number
  holidayPay: number
  bonus: number
  deductions: number
  socialInsurance: number
  tax: number
  otherCosts: number
  totalGross: number
  totalNet: number
  status: 'draft' | 'pending' | 'approved' | 'paid'
  paidDate?: string
}

/* ─── Leave ─── */
export type LeaveRequest = {
  id: string
  employeeId: string
  employeeName: string
  department: string
  type: 'annual' | 'sick' | 'personal' | 'maternity' | 'unpaid' | 'wedding' | 'bereavement'
  startDate: string
  endDate: string
  days: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reason: string
  approver: string
  approvedDate?: string
  createdAt: string
}

/* ─── Recruitment ─── */
export type Recruitment = {
  id: string
  position: string
  department: string
  level: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'manager'
  quantity: number
  applicants: number
  interviewed: number
  passed: number
  salaryRange: string
  deadline: string
  status: 'open' | 'interviewing' | 'closed' | 'cancelled'
  description: string
  requirements: string
  createdAt: string
  createdBy: string
}

/* ─── Revenue ─── */
export type RevenueRecord = {
  id: string
  date: string
  customer: string
  description: string
  amount: number
  category: 'product' | 'service' | 'consulting' | 'investment' | 'other'
  invoiceNo: string
  status: 'confirmed' | 'pending' | 'cancelled'
  paymentMethod: 'transfer' | 'cash' | 'card'
  note: string
}

/* ─── Expenses ─── */
export type ExpenseRecord = {
  id: string
  date: string
  vendor: string
  description: string
  amount: number
  category: 'salary' | 'rent' | 'utilities' | 'marketing' | 'equipment' | 'travel' | 'insurance' | 'tax' | 'other'
  approver: string
  status: 'approved' | 'pending' | 'rejected'
  receiptNo: string
  department: string
  note: string
}

/* ─── Cashflow ─── */
export type CashflowItem = {
  id: string
  date: string
  name: string
  meta: string
  description: string
  amount: string
  rawAmount: number
  type: 'in' | 'out'
  category: string
  balance: number
}

/* ─── Debt / Receivables ─── */
export type DebtRecord = {
  id: string
  type: 'receivable' | 'payable'
  company: string
  contactPerson: string
  phone: string
  amount: number
  paid: number
  remaining: number
  issueDate: string
  dueDate: string
  status: 'current' | 'overdue' | 'paid' | 'bad_debt'
  daysOverdue: number
  invoiceNo: string
  note: string
}

/* ─── Budget ─── */
export type BudgetRecord = {
  id: string
  category: string
  department: string
  period: string
  planned: number
  actual: number
  remaining: number
  pct: number
  status: 'under' | 'on_track' | 'over'
  color: string
}

/* ─── Reports ─── */
export type ReportItem = {
  id: string
  name: string
  type: 'financial' | 'hr' | 'operational'
  period: string
  generatedAt: string
  generatedBy: string
  status: 'ready' | 'generating' | 'error'
  downloadUrl: string
}

/* ─── Overtime (Giờ tăng ca) ─── */
export type OvertimeEntry = {
  id: string
  employeeId: string
  employeeName: string
  date: string   // YYYY-MM-DD
  hours: number  // e.g. 2, 3.5
  note: string
}

/* ─── KPI Violations (Chuyên cần) ─── */
export type KpiViolationType = 'ĐM' | 'NP' | 'KL' | 'LT' | 'QCC'

export type KpiViolation = {
  id: string
  employeeId: string
  employeeName: string
  date: string
  types: KpiViolationType[]
  note: string
}

/* ─── Salary Config (dynamic columns) ─── */
export type CalcMode = 'none' | 'add_to_net' | 'subtract_from_net'

export type SalaryColumn = {
  id: string
  name: string
  key: string         // variable name used in formulas (snake_case)
  type: 'number' | 'formula'
  formula?: string    // e.g. "net_cong_so * luong_co_ban / 26 + thuong"
  isEditable: boolean // admin can input per-employee value each month
  isSystem: boolean   // built-in columns that cannot be deleted
  calcMode: CalcMode  // how column contributes to tong_thuc_nhan
  order: number
}

export type SalaryValue = {
  id: string
  employeeId: string
  month: string       // YYYY-MM
  columnKey: string
  value: number
}

/* ─── Settings ─── */
export type CompanySettings = {
  name: string
  taxCode: string
  address: string
  phone: string
  email: string
  website: string
  director: string
  foundedDate: string
  bankAccount: string
  bankName: string
  logo: string
}

export type SystemConfig = {
  workHoursPerDay: number
  workDaysPerWeek: number
  overtimeRate: number
  holidayRate: number
  socialInsuranceRate: number
  healthInsuranceRate: number
  unemploymentInsuranceRate: number
  taxBrackets: { from: number; to: number; rate: number }[]
  leavePerYear: number
  currency: string
  locale: string
  enableInsuranceTax: boolean  // master toggle: tính + hiển thị BH NV & Thuế TNCN
  showBhColumns: boolean       // legacy: hiển thị cột BH NV (chỉ UI, không ảnh hưởng tính toán)
  showPitColumn: boolean       // legacy: hiển thị cột Thuế TNCN (chỉ UI)
}
