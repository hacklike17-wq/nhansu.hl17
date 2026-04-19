import type {
  Employee, CashflowItem, Department,
  AttendanceRecord, SalaryRecord, LeaveRequest, Recruitment,
  RevenueRecord, ExpenseRecord, DebtRecord, BudgetRecord,
  ReportItem, CompanySettings, SystemConfig, PermissionGroup, SalaryColumn, WorkUnit,
} from '@/types'

/* ═══════════════════════════════════════════════════
   PERMISSION SYSTEM
   ═══════════════════════════════════════════════════ */
export const ALL_MODULES = [
  { key: 'dashboard',  label: 'Dashboard' },
  { key: 'nhanvien',   label: 'Nhân viên' },
  { key: 'chamcong',   label: 'Chấm công' },
  { key: 'luong',      label: 'Lương & thưởng' },
  { key: 'tuyendung',  label: 'Tuyển dụng' },
  { key: 'nghiphep',   label: 'Nghỉ phép' },
  { key: 'doanhthu',   label: 'Doanh thu' },
  { key: 'chiphi',     label: 'Chi phí' },
  { key: 'dongtien',   label: 'Dòng tiền' },
  { key: 'ngansach',   label: 'Ngân sách' },
  { key: 'congno',     label: 'Công nợ' },
  { key: 'baocao',     label: 'Báo cáo' },
  { key: 'phanquyen',  label: 'Phân quyền' },
  { key: 'caidat',     label: 'Cài đặt' },
] as const

export const ALL_ACTIONS = ['view', 'edit', 'delete'] as const
export type PermissionAction = (typeof ALL_ACTIONS)[number]

export const CANONICAL_ROLES = ['admin', 'manager', 'employee'] as const
export type CanonicalRole = (typeof CANONICAL_ROLES)[number]

const LEGACY_ROLE_MAP: Record<string, CanonicalRole> = {
  boss_admin: 'admin',
  admin: 'admin',
  hr_manager: 'manager',
  accountant: 'manager',
  manager: 'manager',
  employee: 'employee',
}

export function normalizeRole(role: string | null | undefined): CanonicalRole {
  if (!role) return 'employee'
  return LEGACY_ROLE_MAP[role] ?? 'employee'
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'PG_ADMIN',
    name: 'admin',
    label: 'Quản trị viên',
    description: 'Toàn quyền hệ thống',
    isSystem: true,
    permissions: ['*'],
  },
  {
    id: 'PG_MANAGER',
    name: 'manager',
    label: 'Quản lý',
    description: 'Quản lý nhân sự, chấm công, lương, báo cáo',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'nhanvien.view', 'nhanvien.edit',
      'chamcong.view', 'chamcong.edit',
      'luong.view', 'luong.edit',
      'tuyendung.view', 'tuyendung.edit',
      'nghiphep.view', 'nghiphep.edit',
      'doanhthu.view', 'chiphi.view',
      'dongtien.view', 'ngansach.view', 'congno.view',
      'baocao.view',
    ],
  },
  {
    id: 'PG_EMPLOYEE',
    name: 'employee',
    label: 'Nhân viên',
    description: 'Chỉ xem thông tin cá nhân',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'luong.view',
      'chamcong.view',
      'nghiphep.view', 'nghiphep.edit',
    ],
  },
]

/** Check if a permission list grants access */
export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true
  if (permissions.includes(required)) return true
  const [mod] = required.split('.')
  if (permissions.includes(`${mod}.*`)) return true
  return false
}

/** Resolve permissions for a role + overrides (uses static PERMISSION_GROUPS) */
export function resolvePermissions(role: string, overrides: string[]): string[] {
  const group = PERMISSION_GROUPS.find(g => g.name === role)
  const base = group ? [...group.permissions] : []
  for (const p of overrides) {
    if (!base.includes(p)) base.push(p)
  }
  return base
}

/** Resolve permissions using dynamic groups (from context/localStorage) */
export function resolvePermissionsFromGroups(
  groups: PermissionGroup[], role: string, overrides: string[]
): string[] {
  const group = groups.find(g => g.name === role)
  const base = group ? [...group.permissions] : []
  for (const p of overrides) {
    if (!base.includes(p)) base.push(p)
  }
  return base
}

/** Map route path → required permission */
export const ROUTE_PERMISSION: Record<string, string> = {
  '/': 'dashboard.view',
  '/nhanvien': 'nhanvien.view',
  '/chamcong': 'chamcong.view',
  '/luong': 'luong.view',
  '/tuyendung': 'tuyendung.view',
  '/nghiphep': 'nghiphep.view',
  '/khong-luong': 'nghiphep.view',
  '/doanhthu': 'doanhthu.view',
  '/chiphi': 'chiphi.view',
  '/dongtien': 'dongtien.view',
  '/ngansach': 'ngansach.view',
  '/congno': 'congno.view',
  '/baocao': 'baocao.view',
  '/phanquyen': 'phanquyen.view',
  '/caidat': 'caidat.view',
  '/doi-mat-khau': 'dashboard.view',
}

/* ═══════════════════════════════════════════════════
   DEFAULT SALARY COLUMNS
   ═══════════════════════════════════════════════════ */
export const DEFAULT_SALARY_COLUMNS: SalaryColumn[] = [
  { id:'SC01', name:'Lương cơ bản',  key:'luong_co_ban',  type:'number',  isEditable:false, isSystem:true,  calcMode:'none',             order:0 },
  { id:'SC02', name:'Công số nhận',  key:'cong_so_nhan',  type:'number',  isEditable:false, isSystem:true,  calcMode:'none',             order:1 },
  { id:'SC05', name:'Thưởng KPI',    key:'thuong_kpi',    type:'number',  isEditable:true,  isSystem:false, calcMode:'add_to_net',       order:2 },
  { id:'SC06', name:'Phụ cấp',       key:'phu_cap',       type:'number',  isEditable:true,  isSystem:false, calcMode:'add_to_net',       order:3 },
  { id:'SC07', name:'Phạt',          key:'phat',          type:'number',  isEditable:true,  isSystem:false, calcMode:'subtract_from_net', order:4 },
  { id:'SC08', name:'Thực nhận',     key:'thuc_nhan',     type:'formula', formula:'Math.max(0, cong_so_nhan + cong_so_tru) * luong_co_ban / 26 + thuong_kpi + phu_cap - phat', isEditable:false, isSystem:true, calcMode:'none', order:5 },
]

/* ═══════════════════════════════════════════════════
   DEPARTMENTS
   ═══════════════════════════════════════════════════ */
export const DEPARTMENTS: Department[] = [
  { id: 'D001', name: 'Hacklike17',         code: 'HL17', managerId: 'E008', managerName: 'Văn Hoà Nguyên',     headcount: 8, budget: 500000000,  color: 'blue'   },
  { id: 'D002', name: 'Chăm sóc khách hàng', code: 'CSKH', managerId: 'E001', managerName: 'Đào Trọng Phụng',  headcount: 1, budget: 200000000,  color: 'green'  },
]

/* ═══════════════════════════════════════════════════
   EMPLOYEES (8 records — Hacklike17)
   ═══════════════════════════════════════════════════ */
export const EMPLOYEES: Employee[] = [
  { id:'E001', code:'NV001', name:'Đào Trọng Phụng',       email:'daotrongphung260601@gmail.com', phone:'0346744743', department:'Hacklike17', departmentId:'D001', deptColor:'blue',  position:'Chăm sóc khách hàng', role:'Nhân viên',  status:'working', joinDate:'2026-02-26', salary:8000000, responsibilitySalary:0, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'2001-06-26', gender:'male',   hours:'--', contractType:'fulltime', accountEmail:'daotrongphung260601@gmail.com', accountPassword:'phung@123',  accountRole:'employee',   accountPermissions:[], accountStatus:'active' },
  { id:'E002', code:'NV002', name:'Bùi Minh Phượng',       email:'bmdat2021@gmail.com',           phone:'0973110786', department:'Hacklike17', departmentId:'D001', deptColor:'blue',  position:'Nhân viên',            role:'Nhân viên',  status:'working', joinDate:'2026-01-06', salary:8000000, responsibilitySalary:0, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'1987-11-20', gender:'female', hours:'--', contractType:'fulltime', accountEmail:'bmdat2021@gmail.com',           accountPassword:'phuong@123', accountRole:'employee',   accountPermissions:[], accountStatus:'active' },
  { id:'E003', code:'NV003', name:'Phạm Đình Quân',        email:'anhquanidol9009@gmail.com',     phone:'0978267283', department:'Hacklike17', departmentId:'D001', deptColor:'blue',  position:'Nhân viên',            role:'Nhân viên',  status:'working', joinDate:'2026-04-01', salary:8000000, responsibilitySalary:0, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'1997-09-05', gender:'male',   hours:'--', contractType:'fulltime', accountEmail:'anhquanidol9009@gmail.com',     accountPassword:'quan@123',   accountRole:'employee',   accountPermissions:[], accountStatus:'active' },
  { id:'E004', code:'NV004', name:'Nguyễn Duy Dương',      email:'nguyenduong1996tb@gmail.com',   phone:'0967188711', department:'Hacklike17', departmentId:'D001', deptColor:'blue',  position:'Nhân viên',            role:'Nhân viên',  status:'working', joinDate:'2026-04-01', salary:9000000, responsibilitySalary:0, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'1996-02-29', gender:'male',   hours:'--', contractType:'fulltime', accountEmail:'nguyenduong1996tb@gmail.com',   accountPassword:'duong@123',  accountRole:'admin',      accountPermissions:[], accountStatus:'active' },
  { id:'E005', code:'NV005', name:'Nguyễn Trường Giang',   email:'gianghugi0212@gmail.com',       phone:'0866657532', department:'Hacklike17', departmentId:'D001', deptColor:'blue',  position:'Nhân viên',            role:'Nhân viên',  status:'working', joinDate:'2026-04-02', salary:8000000, responsibilitySalary:0, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'2005-12-02', gender:'male',   hours:'--', contractType:'fulltime', accountEmail:'gianghugi0212@gmail.com',       accountPassword:'giang@123',  accountRole:'employee',   accountPermissions:[], accountStatus:'active' },
  { id:'E006', code:'NV006', name:'Nguyễn Mạnh Tiến',      email:'nguyenmanhtien.dvfb.93@gmail.com', phone:'0826131366', department:'Hacklike17', departmentId:'D001', deptColor:'blue', position:'Nhân viên',       role:'Nhân viên',  status:'working', joinDate:'2026-04-02', salary:8000000, responsibilitySalary:0, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'1993-06-03', gender:'male',   hours:'--', contractType:'fulltime', accountEmail:'nguyenmanhtien.dvfb.93@gmail.com', accountPassword:'tien@123', accountRole:'employee',  accountPermissions:[], accountStatus:'active' },
  { id:'E007', code:'NV007', name:'Nguyễn Văn Tuấn',       email:'tuannvarena@gmail.com',         phone:'0869762258', department:'Hacklike17', departmentId:'D001', deptColor:'blue',  position:'Nhân viên',            role:'Nhân viên',  status:'working', joinDate:'2026-04-03', salary:8000000, responsibilitySalary:0, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'2000-11-24', gender:'male',   hours:'--', contractType:'fulltime', accountEmail:'tuannvarena@gmail.com',         accountPassword:'tuan@123',   accountRole:'employee',   accountPermissions:[], accountStatus:'active' },
  { id:'E008', code:'NV008', name:'Văn Hoà Nguyên',        email:'hoahenry1803@gmail.com',        phone:'0928976666', department:'Hacklike17', departmentId:'D001', deptColor:'blue',  position:'Quản lý',              role:'Quản lý',    status:'working', joinDate:'2026-04-03', salary:15000000, responsibilitySalary:2000000, bankAccount:'--', bankName:'--', taxCode:'--', socialInsurance:'--', address:'--', dob:'',           gender:'male',   hours:'--', contractType:'fulltime', accountEmail:'hoahenry1803@gmail.com',        accountPassword:'admin@123',  accountRole:'admin', accountPermissions:[], accountStatus:'active' },
]

/* ═══════════════════════════════════════════════════
   DEFAULT WORK UNITS (công số nhận mẫu tháng 04/2026)
   ═══════════════════════════════════════════════════ */
export const DEFAULT_WORK_UNITS: WorkUnit[] = (() => {
  const workdays = [
    '2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-07',
    '2026-04-08','2026-04-09','2026-04-10','2026-04-11',
  ]
  const units: WorkUnit[] = []
  let idx = 1
  for (const emp of EMPLOYEES) {
    for (const date of workdays) {
      units.push({ id:`WU${String(idx++).padStart(4,'0')}`, employeeId:emp.id, employeeName:emp.name, date, units:1, note:'' })
    }
  }
  return units
})()

/* ═══════════════════════════════════════════════════
   ATTENDANCE (sample: 1 week for top employees)
   ═══════════════════════════════════════════════════ */
function genAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = []
  const dates = ['2026-04-07','2026-04-08','2026-04-09']
  const emps = EMPLOYEES.slice(0, 15)
  let id = 1
  for (const emp of emps) {
    for (const date of dates) {
      const isLeave = emp.status === 'leave'
      const isLate = Math.random() < 0.15
      const checkIn = isLeave ? '—' : isLate ? '08:' + String(Math.floor(Math.random()*30+15)).padStart(2,'0') : '08:0' + Math.floor(Math.random()*8)
      const checkOut = isLeave ? '—' : '17:' + String(Math.floor(Math.random()*30)).padStart(2,'0')
      const ot = !isLeave && Math.random() < 0.3 ? Math.round(Math.random()*3*10)/10 : 0
      records.push({
        id: `ATT${String(id++).padStart(4,'0')}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        date,
        checkIn,
        checkOut,
        status: isLeave ? 'leave' : isLate ? 'late' : emp.status === 'remote' ? 'remote' : 'on_time',
        overtime: ot,
        note: isLeave ? 'Nghỉ phép năm' : isLate ? 'Kẹt xe' : '',
      })
    }
  }
  return records
}
export const ATTENDANCE_DATA: AttendanceRecord[] = genAttendance()

/* ═══════════════════════════════════════════════════
   SALARY
   ═══════════════════════════════════════════════════ */
export const SALARY_DATA: SalaryRecord[] = EMPLOYEES.filter(e => e.status !== 'resigned').map((emp, i) => {
  const base = emp.salary || 8000000
  const kpiAtt = Math.round(base * (0.9 + Math.random() * 0.1))
  const kpiPerf = Math.round(base * (0.7 + Math.random() * 0.3))
  const ot = Math.round(Math.random() * 2000000)
  const holiday = 0
  const bonus = Math.random() < 0.2 ? Math.round(Math.random() * 1000000) : 0
  const si = Math.round(base * 0.08)
  const hi = Math.round(base * 0.015)
  const ui = Math.round(base * 0.01)
  const deductions = si + hi + ui
  const gross = base + ot + holiday + bonus
  const taxable = gross - deductions - 11000000
  const tax = taxable > 0 ? Math.round(taxable * 0.1) : 0
  const net = gross - deductions - tax
  return {
    id: `SAL${String(i+1).padStart(4,'0')}`,
    employeeId: emp.id,
    employeeName: emp.name,
    department: emp.department,
    month: '2026-04',
    baseSalary: base,
    kpiAttendance: base > 0 ? Math.round((kpiAtt / base) * 100) : 0,
    kpiPerformance: base > 0 ? Math.round((kpiPerf / base) * 100) : 0,
    overtimePay: ot,
    holidayPay: holiday,
    bonus,
    deductions,
    socialInsurance: si,
    tax,
    otherCosts: 0,
    totalGross: gross,
    totalNet: net,
    status: i < 3 ? 'paid' : i < 6 ? 'approved' : 'pending',
    paidDate: i < 3 ? '2026-04-05' : undefined,
  }
})

/* ═══════════════════════════════════════════════════
   LEAVE REQUESTS
   ═══════════════════════════════════════════════════ */
export const LEAVE_DATA: LeaveRequest[] = [
  { id:'LV001', employeeId:'E001', employeeName:'Đào Trọng Phụng',      department:'Hacklike17', type:'annual',   startDate:'2026-04-07', endDate:'2026-04-11', days:5, status:'approved', reason:'Du lịch gia đình',      approver:'Văn Hoà Nguyên', approvedDate:'2026-04-01', createdAt:'2026-03-25' },
  { id:'LV002', employeeId:'E003', employeeName:'Phạm Đình Quân',       department:'Hacklike17', type:'sick',     startDate:'2026-04-08', endDate:'2026-04-09', days:2, status:'approved', reason:'Cảm cúm, có giấy BS',   approver:'Văn Hoà Nguyên', approvedDate:'2026-04-08', createdAt:'2026-04-08' },
  { id:'LV003', employeeId:'E005', employeeName:'Nguyễn Trường Giang',  department:'Hacklike17', type:'personal', startDate:'2026-04-14', endDate:'2026-04-14', days:1, status:'pending',  reason:'Việc cá nhân',          approver:'Văn Hoà Nguyên', createdAt:'2026-04-09' },
  { id:'LV004', employeeId:'E007', employeeName:'Nguyễn Văn Tuấn',      department:'Hacklike17', type:'annual',   startDate:'2026-04-21', endDate:'2026-04-22', days:2, status:'pending',  reason:'Nghỉ phép năm',         approver:'Văn Hoà Nguyên', createdAt:'2026-04-09' },
  { id:'LV005', employeeId:'E002', employeeName:'Bùi Minh Phượng',      department:'Hacklike17', type:'sick',     startDate:'2026-04-02', endDate:'2026-04-03', days:2, status:'approved', reason:'Đau đầu, mệt mỏi',     approver:'Văn Hoà Nguyên', approvedDate:'2026-04-02', createdAt:'2026-04-02' },
  { id:'LV006', employeeId:'E006', employeeName:'Nguyễn Mạnh Tiến',     department:'Hacklike17', type:'personal', startDate:'2026-04-28', endDate:'2026-04-28', days:1, status:'pending',  reason:'Đưa con đi khám bệnh', approver:'Văn Hoà Nguyên', createdAt:'2026-04-09' },
]

/* ═══════════════════════════════════════════════════
   RECRUITMENT
   ═══════════════════════════════════════════════════ */
export const RECRUITMENT_DATA: Recruitment[] = [
  { id:'RC001', position:'Nhân viên kinh doanh',       department:'Hacklike17', level:'junior', quantity:3, applicants:25, interviewed:8,  passed:2, salaryRange:'8–15 triệu',  deadline:'2026-04-30', status:'interviewing', description:'Tìm kiếm và phát triển khách hàng mới',       requirements:'Kỹ năng giao tiếp, chăm chỉ',  createdAt:'2026-03-01', createdBy:'Văn Hoà Nguyên' },
  { id:'RC002', position:'Chăm sóc khách hàng',        department:'Hacklike17', level:'junior', quantity:2, applicants:18, interviewed:6,  passed:1, salaryRange:'7–12 triệu',  deadline:'2026-05-15', status:'open',         description:'Hỗ trợ và chăm sóc khách hàng sau bán hàng',  requirements:'Kiên nhẫn, kỹ năng giao tiếp', createdAt:'2026-03-15', createdBy:'Văn Hoà Nguyên' },
  { id:'RC003', position:'Nhân viên kỹ thuật',         department:'Hacklike17', level:'mid',    quantity:1, applicants:12, interviewed:4,  passed:0, salaryRange:'10–18 triệu', deadline:'2026-05-01', status:'open',         description:'Hỗ trợ kỹ thuật, bảo trì hệ thống',           requirements:'Có kinh nghiệm IT',             createdAt:'2026-03-20', createdBy:'Văn Hoà Nguyên' },
]

/* ═══════════════════════════════════════════════════
   FINANCE MOCK DATA — wiped 2026-04-14
   ═══════════════════════════════════════════════════
   These arrays used to ship seed data used only by the /doanhthu,
   /chiphi, /dongtien, /congno, /ngansach, /baocao demo pages. The
   financial module now reads from real DB tables, so the constants
   are empty. The type re-exports stay so the TS compiler is happy
   for any remaining consumer — each consumer falls through the empty
   array into its own empty-state UI. */
export const REVENUE_DATA: RevenueRecord[] = []
export const EXPENSE_DATA: ExpenseRecord[] = []
export const CASHFLOW_DATA: CashflowItem[] = []
export const DEBT_DATA: DebtRecord[] = []
export const BUDGET_DETAIL_DATA: BudgetRecord[] = []
export const REPORT_DATA: ReportItem[] = []

/* ═══════════════════════════════════════════════════
   COMPANY SETTINGS
   ═══════════════════════════════════════════════════ */
export const COMPANY_SETTINGS: CompanySettings = {
  name: 'nhansu.hl17',
  taxCode: '0312345678',
  address: '123 Nguyễn Du, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
  phone: '028-3822-1234',
  email: 'contact@hl17.vn',
  website: 'https://hl17.vn',
  director: 'Văn Hoà Nguyên',
  foundedDate: '2020-01-15',
  bankAccount: '0123456789',
  bankName: 'Vietcombank — CN TP.HCM',
  logo: '',
}

export const SYSTEM_CONFIG: SystemConfig = {
  workHoursPerDay: 8,
  workDaysPerWeek: 5,
  overtimeRate: 1.5,
  holidayRate: 3.0,
  socialInsuranceRate: 0.08,
  healthInsuranceRate: 0.015,
  unemploymentInsuranceRate: 0.01,
  taxBrackets: [
    { from: 0,        to: 5000000,   rate: 0.05 },
    { from: 5000000,  to: 10000000,  rate: 0.10 },
    { from: 10000000, to: 18000000,  rate: 0.15 },
    { from: 18000000, to: 32000000,  rate: 0.20 },
    { from: 32000000, to: 52000000,  rate: 0.25 },
    { from: 52000000, to: 80000000,  rate: 0.30 },
    { from: 80000000, to: Infinity,  rate: 0.35 },
  ],
  leavePerYear: 12,
  currency: 'VND',
  locale: 'vi-VN',
  enableInsuranceTax: true,
  showBhColumns: true,
  showPitColumn: true,
}

export const NAV_SECTIONS = [
  {
    label: 'Tổng quan',
    items: [
      { label:'Dashboard', href:'/',        icon:'grid' },
      { label:'Báo cáo',   href:'/baocao',  icon:'chart' },
    ],
  },
  {
    label: 'Nhân sự',
    items: [
      { label:'Nhân viên',         href:'/nhanvien',    icon:'users' },
      { label:'Công số',           href:'/chamcong',    icon:'calendar' },
      { label:'Lương & thưởng',    href:'/luong',       icon:'clock' },
      { label:'Nghỉ không lương',  href:'/khong-luong', icon:'calendar' },
      { label:'Tuyển dụng',        href:'/tuyendung',   icon:'arrow', badge:{ text:'5', variant:'amber' as const } },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      { label:'Doanh thu', href:'/doanhthu', icon:'trending' },
      { label:'Chi phí',   href:'/chiphi',   icon:'dollar' },
      { label:'Dòng tiền', href:'/dongtien', icon:'flow' },
      { label:'Ngân sách', href:'/ngansach', icon:'lock' },
      { label:'Công nợ',   href:'/congno',   icon:'file' },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { label:'Phân quyền', href:'/phanquyen', icon:'settings' },
      { label:'Cài đặt',    href:'/caidat',    icon:'cog' },
      { label:'Đổi mật khẩu', href:'/doi-mat-khau', icon:'lock' },
    ],
  },
]
