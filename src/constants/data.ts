import type {
  KpiData, Employee, CashflowItem, BudgetItem, Department,
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
   REVENUE
   ═══════════════════════════════════════════════════ */
export const REVENUE_DATA: RevenueRecord[] = [
  { id:'REV001', date:'2026-04-09', customer:'Cty TNHH Minh Anh',       description:'Hợp đồng dịch vụ CNTT Q2/2026',     amount:520000000,  category:'service',    invoiceNo:'INV-2026-0401', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV002', date:'2026-04-08', customer:'Tập đoàn Hòa Phát',       description:'Bán phần mềm ERP module Kho',        amount:380000000,  category:'product',    invoiceNo:'INV-2026-0402', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV003', date:'2026-04-07', customer:'Cty CP VinaTech',          description:'Tư vấn chuyển đổi số',              amount:150000000,  category:'consulting', invoiceNo:'INV-2026-0403', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV004', date:'2026-04-05', customer:'Cty TNHH SaigonFood',     description:'License phần mềm 1 năm',            amount:240000000,  category:'product',    invoiceNo:'INV-2026-0404', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV005', date:'2026-04-04', customer:'Bệnh viện Đa khoa Q.2',   description:'Hệ thống quản lý bệnh nhân',        amount:680000000,  category:'service',    invoiceNo:'INV-2026-0405', status:'pending',   paymentMethod:'transfer', note:'Đang chờ duyệt thanh toán' },
  { id:'REV006', date:'2026-04-03', customer:'Trường ĐH Bách Khoa',     description:'Module quản lý sinh viên',           amount:320000000,  category:'product',    invoiceNo:'INV-2026-0406', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV007', date:'2026-04-02', customer:'Cty CP Logistic Tân Cảng',description:'Giải pháp tracking container',       amount:890000000,  category:'service',    invoiceNo:'INV-2026-0407', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV008', date:'2026-04-01', customer:'Cty TNHH Thái Sơn',       description:'Dịch vụ bảo trì hàng tháng',        amount:120000000,  category:'service',    invoiceNo:'INV-2026-0408', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV009', date:'2026-03-28', customer:'Ngân hàng ACB',            description:'Module báo cáo tự động',            amount:450000000,  category:'product',    invoiceNo:'INV-2026-0309', status:'confirmed', paymentMethod:'transfer', note:'' },
  { id:'REV010', date:'2026-03-25', customer:'Cty CP Đất Xanh',          description:'Tư vấn & triển khai CRM',           amount:550000000,  category:'consulting', invoiceNo:'INV-2026-0310', status:'confirmed', paymentMethod:'transfer', note:'' },
]

/* ═══════════════════════════════════════════════════
   EXPENSES
   ═══════════════════════════════════════════════════ */
export const EXPENSE_DATA: ExpenseRecord[] = [
  { id:'EXP001', date:'2026-04-05', vendor:'Nội bộ',               description:'Chi lương tháng 3/2026',        amount:890000000,  category:'salary',    approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0401', department:'Hacklike17',    note:'Lương tháng 3' },
  { id:'EXP002', date:'2026-04-03', vendor:'Cty TNHH Việt A',     description:'Máy chủ Dell PowerEdge R750',    amount:420000000,  category:'equipment', approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0402', department:'Hacklike17',    note:'2 máy chủ + cài đặt' },
  { id:'EXP003', date:'2026-04-02', vendor:'Google Cloud',         description:'Cloud hosting tháng 3',         amount:85000000,   category:'utilities', approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0403', department:'Hacklike17',    note:'' },
  { id:'EXP004', date:'2026-04-01', vendor:'Cty BĐS Phú Mỹ',     description:'Thuê văn phòng Q2/2026',        amount:180000000,  category:'rent',      approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0404', department:'Hacklike17',    note:'3 tháng' },
  { id:'EXP005', date:'2026-04-01', vendor:'Facebook Ads',         description:'Quảng cáo tháng 3',             amount:65000000,   category:'marketing', approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0405', department:'Hacklike17',    note:'' },
  { id:'EXP006', date:'2026-03-30', vendor:'Bảo Việt',             description:'BHXH, BHYT quý 1/2026',         amount:320000000,  category:'insurance', approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0306', department:'Hacklike17',    note:'' },
  { id:'EXP007', date:'2026-03-28', vendor:'Cty ĐT Toàn Cầu',     description:'Đào tạo kỹ năng Q1',            amount:45000000,   category:'other',     approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0307', department:'Hacklike17',    note:'8 nhân viên' },
  { id:'EXP008', date:'2026-03-25', vendor:'Vietnam Airlines',     description:'Công tác Hà Nội',               amount:28000000,   category:'travel',    approver:'Văn Hoà Nguyên', status:'approved', receiptNo:'PC-2026-0308', department:'Hacklike17',    note:'2 người, 2 ngày' },
  { id:'EXP009', date:'2026-04-08', vendor:'Cty TNHH In Ấn ABC',  description:'In brochure sản phẩm mới',      amount:15000000,   category:'marketing', approver:'Văn Hoà Nguyên', status:'pending',  receiptNo:'PC-2026-0409', department:'Hacklike17',    note:'5000 bản' },
  { id:'EXP010', date:'2026-04-09', vendor:'Điện lực TP.HCM',     description:'Tiền điện tháng 3',             amount:42000000,   category:'utilities', approver:'Văn Hoà Nguyên', status:'pending',  receiptNo:'PC-2026-0410', department:'Hacklike17',    note:'' },
]

/* ═══════════════════════════════════════════════════
   CASHFLOW (detailed)
   ═══════════════════════════════════════════════════ */
export const CASHFLOW_DATA: CashflowItem[] = [
  { id:'CF001', date:'2026-04-09', name:'Cty TNHH Minh Anh',    meta:'09/04 · Chuyển khoản', description:'Thanh toán HĐ dịch vụ CNTT',  amount:'+520 tr',  rawAmount:520000000,   type:'in',  category:'Thu dịch vụ',   balance:9270000000 },
  { id:'CF002', date:'2026-04-08', name:'Tập đoàn Hòa Phát',    meta:'08/04 · Chuyển khoản', description:'Thanh toán phần mềm ERP',      amount:'+380 tr',  rawAmount:380000000,   type:'in',  category:'Thu sản phẩm',  balance:8750000000 },
  { id:'CF003', date:'2026-04-05', name:'Chi lương tháng 3',     meta:'05/04 · Tự động',      description:'Lương + BHXH tháng 3/2026',    amount:'–890 tr',  rawAmount:-890000000,  type:'out', category:'Chi lương',     balance:8370000000 },
  { id:'CF004', date:'2026-04-04', name:'Cty TNHH SaigonFood',  meta:'04/04 · Chuyển khoản', description:'License phần mềm 1 năm',       amount:'+240 tr',  rawAmount:240000000,   type:'in',  category:'Thu sản phẩm',  balance:9260000000 },
  { id:'CF005', date:'2026-04-03', name:'Cty TNHH Việt A',      meta:'03/04 · Ủy nhiệm chi', description:'Mua máy chủ Dell',              amount:'–420 tr',  rawAmount:-420000000,  type:'out', category:'Chi thiết bị',  balance:9020000000 },
  { id:'CF006', date:'2026-04-03', name:'Google Cloud',          meta:'03/04 · Thẻ quốc tế',  description:'Cloud hosting tháng 3',         amount:'–85 tr',   rawAmount:-85000000,   type:'out', category:'Chi vận hành',  balance:9440000000 },
  { id:'CF007', date:'2026-04-02', name:'Cty CP Logistic Tân Cảng',meta:'02/04 · CK', description:'Giải pháp tracking container',   amount:'+890 tr',  rawAmount:890000000,   type:'in',  category:'Thu dịch vụ',   balance:9525000000 },
  { id:'CF008', date:'2026-04-01', name:'Cty BĐS Phú Mỹ',      meta:'01/04 · Ủy nhiệm chi', description:'Thuê VP Q2/2026',               amount:'–180 tr',  rawAmount:-180000000,  type:'out', category:'Chi thuê mặt bằng', balance:8635000000 },
  { id:'CF009', date:'2026-04-01', name:'Cty TNHH Thái Sơn',    meta:'01/04 · Chuyển khoản', description:'Phí bảo trì tháng 4',          amount:'+120 tr',  rawAmount:120000000,   type:'in',  category:'Thu dịch vụ',   balance:8815000000 },
  { id:'CF010', date:'2026-04-01', name:'Facebook Ads',          meta:'01/04 · Thẻ quốc tế',  description:'Quảng cáo tháng 3',             amount:'–65 tr',   rawAmount:-65000000,   type:'out', category:'Chi marketing', balance:8695000000 },
]

/* ═══════════════════════════════════════════════════
   DEBT / ACCOUNTS RECEIVABLE & PAYABLE
   ═══════════════════════════════════════════════════ */
export const DEBT_DATA: DebtRecord[] = [
  { id:'DT001', type:'receivable', company:'Bệnh viện Đa khoa Q.2',    contactPerson:'Nguyễn Văn Tùng', phone:'0903111222', amount:680000000,  paid:0,         remaining:680000000,  issueDate:'2026-04-04', dueDate:'2026-05-04', status:'current',  daysOverdue:0,  invoiceNo:'INV-2026-0405', note:'HĐ hệ thống QLBN' },
  { id:'DT002', type:'receivable', company:'Cty CP Đất Xanh',          contactPerson:'Trần Minh Đức',   phone:'0903111223', amount:550000000,  paid:200000000, remaining:350000000,  issueDate:'2026-03-25', dueDate:'2026-04-25', status:'current',  daysOverdue:0,  invoiceNo:'INV-2026-0310', note:'Tư vấn CRM - đợt 2' },
  { id:'DT003', type:'receivable', company:'Cty TNHH ABC Logistics',   contactPerson:'Lê Hữu Toàn',    phone:'0903111224', amount:320000000,  paid:0,         remaining:320000000,  issueDate:'2026-03-01', dueDate:'2026-04-01', status:'overdue',  daysOverdue:8,  invoiceNo:'INV-2026-0215', note:'Quá hạn - đã liên hệ' },
  { id:'DT004', type:'receivable', company:'Trường ĐH Công nghệ',      contactPerson:'PGS.TS Hoàng An', phone:'0903111225', amount:180000000,  paid:180000000, remaining:0,          issueDate:'2026-02-15', dueDate:'2026-03-15', status:'paid',     daysOverdue:0,  invoiceNo:'INV-2026-0110', note:'Đã thanh toán đủ' },
  { id:'DT005', type:'payable',    company:'Cty TNHH Việt A',          contactPerson:'Nguyễn Bá Cường', phone:'0903222111', amount:420000000,  paid:420000000, remaining:0,          issueDate:'2026-03-28', dueDate:'2026-04-15', status:'paid',     daysOverdue:0,  invoiceNo:'PO-2026-0301',  note:'Máy chủ Dell - đã TT' },
  { id:'DT006', type:'payable',    company:'Google Cloud Platform',     contactPerson:'—',               phone:'—',          amount:85000000,   paid:85000000,  remaining:0,          issueDate:'2026-04-01', dueDate:'2026-04-05', status:'paid',     daysOverdue:0,  invoiceNo:'PO-2026-0302',  note:'Thanh toán tự động' },
  { id:'DT007', type:'payable',    company:'Cty BĐS Phú Mỹ',          contactPerson:'Bà Lê Thị Hoa',   phone:'0903222112', amount:180000000,  paid:0,         remaining:180000000,  issueDate:'2026-04-01', dueDate:'2026-04-30', status:'current',  daysOverdue:0,  invoiceNo:'PO-2026-0303',  note:'Thuê VP Q2' },
  { id:'DT008', type:'payable',    company:'Cty TNHH In Ấn ABC',       contactPerson:'Ông Trần Hải',    phone:'0903222113', amount:15000000,   paid:0,         remaining:15000000,   issueDate:'2026-04-08', dueDate:'2026-04-22', status:'current',  daysOverdue:0,  invoiceNo:'PO-2026-0304',  note:'In brochure' },
]

/* ═══════════════════════════════════════════════════
   BUDGET (detailed by dept)
   ═══════════════════════════════════════════════════ */
export const BUDGET_DETAIL_DATA: BudgetRecord[] = [
  { id:'BG001', category:'Nhân sự',   department:'Toàn công ty', period:'Q2/2026', planned:2800000000, actual:2016000000, remaining:784000000,  pct:72, status:'on_track', color:'#2563EB' },
  { id:'BG002', category:'Vận hành',  department:'Toàn công ty', period:'Q2/2026', planned:800000000,  actual:464000000,  remaining:336000000,  pct:58, status:'on_track', color:'#0D9488' },
  { id:'BG003', category:'Marketing', department:'Marketing',     period:'Q2/2026', planned:500000000,  actual:445000000,  remaining:55000000,   pct:89, status:'over',     color:'#F59E0B' },
  { id:'BG004', category:'Công nghệ', department:'Kỹ thuật',     period:'Q2/2026', planned:600000000,  actual:258000000,  remaining:342000000,  pct:43, status:'under',    color:'#7C3AED' },
  { id:'BG005', category:'Đào tạo',   department:'Nhân sự',      period:'Q2/2026', planned:200000000,  actual:62000000,   remaining:138000000,  pct:31, status:'under',    color:'#16A34A' },
  { id:'BG006', category:'Văn phòng', department:'Hành chính',   period:'Q2/2026', planned:350000000,  actual:222000000,  remaining:128000000,  pct:63, status:'on_track', color:'#EC4899' },
  { id:'BG007', category:'Bán hàng',  department:'Kinh doanh',   period:'Q2/2026', planned:400000000,  actual:186000000,  remaining:214000000,  pct:47, status:'under',    color:'#F97316' },
]

/* ═══════════════════════════════════════════════════
   REPORTS
   ═══════════════════════════════════════════════════ */
export const REPORT_DATA: ReportItem[] = [
  { id:'RPT001', name:'Báo cáo tài chính Q1/2026',        type:'financial',   period:'Q1/2026',      generatedAt:'2026-04-05T10:00:00', generatedBy:'Văn Hoà Nguyên', status:'ready',      downloadUrl:'#' },
  { id:'RPT002', name:'Bảng lương tháng 3/2026',          type:'financial',   period:'Tháng 3/2026', generatedAt:'2026-04-03T14:30:00', generatedBy:'Văn Hoà Nguyên', status:'ready',      downloadUrl:'#' },
  { id:'RPT003', name:'Báo cáo nhân sự Q1/2026',          type:'hr',          period:'Q1/2026',      generatedAt:'2026-04-02T09:00:00', generatedBy:'Văn Hoà Nguyên', status:'ready',      downloadUrl:'#' },
  { id:'RPT004', name:'Báo cáo P&L tháng 3/2026',         type:'financial',   period:'Tháng 3/2026', generatedAt:'2026-04-01T16:00:00', generatedBy:'Văn Hoà Nguyên', status:'ready',      downloadUrl:'#' },
  { id:'RPT005', name:'Báo cáo chấm công tháng 4/2026',   type:'hr',          period:'Tháng 4/2026', generatedAt:'2026-04-09T08:00:00', generatedBy:'Văn Hoà Nguyên', status:'generating', downloadUrl:'#' },
]

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

/* ═══════════════════════════════════════════════════
   DASHBOARD DATA (kept for existing components)
   ═══════════════════════════════════════════════════ */
export const KPI_DATA: KpiData[] = [
  { label:'Doanh thu tháng',      value:'4.200.000.000', delta:'+8,4%',  deltaType:'up',   period:'so với tháng 3', accent:'#2563EB', iconBg:'bg-blue-50' },
  { label:'Chi phí tháng',        value:'2.900.000.000', delta:'+3,1%',  deltaType:'warn', period:'so với kế hoạch', accent:'#D97706', iconBg:'bg-amber-50' },
  { label:'Lợi nhuận trước thuế', value:'1.300.000.000', delta:'+18,2%', deltaType:'up',   period:'so với tháng 3', accent:'#16A34A', iconBg:'bg-green-50' },
  { label:'Số dư tiền mặt',      value:'8.750.000.000', delta:'+5,3%',  deltaType:'up',   period:'so với đầu tháng',accent:'#7C3AED', iconBg:'bg-purple-50' },
]

export const REVENUE_CHART_DATA = [
  { month:'T11', revenue:3200, expense:2100, profit:1100 },
  { month:'T12', revenue:3500, expense:2300, profit:1200 },
  { month:'T1',  revenue:3800, expense:2500, profit:1300 },
  { month:'T2',  revenue:3600, expense:2400, profit:1200 },
  { month:'T3',  revenue:4000, expense:2650, profit:1350 },
  { month:'T4',  revenue:4200, expense:2900, profit:1300 },
]

export const EMPLOYEE_DATA = EMPLOYEES.slice(0, 5)

export const BUDGET_DATA: BudgetItem[] = [
  { label:'Nhân sự',   pct:72, color:'#2563EB' },
  { label:'Vận hành',  pct:58, color:'#0D9488' },
  { label:'Marketing', pct:89, color:'#F59E0B' },
  { label:'Công nghệ', pct:43, color:'#7C3AED' },
  { label:'Đào tạo',   pct:31, color:'#16A34A' },
]

export const DONUT_DATA = [
  { name:'Lương & BHXH', value:52, color:'#2563EB' },
  { name:'Vận hành',      value:21, color:'#0D9488' },
  { name:'Marketing',     value:14, color:'#F59E0B' },
  { name:'CAPEX',         value:8,  color:'#7C3AED' },
  { name:'Khác',          value:5,  color:'#D1D5DB' },
]

export const NAV_SECTIONS = [
  {
    label: 'Tổng quan',
    items: [
      { label:'Dashboard', href:'/',        icon:'grid' },
      { label:'Báo cáo',   href:'/baocao',  icon:'chart', badge:{ text:'3', variant:'red' as const } },
    ],
  },
  {
    label: 'Nhân sự',
    items: [
      { label:'Nhân viên',      href:'/nhanvien',  icon:'users' },
      { label:'Công số',        href:'/chamcong',  icon:'calendar' },
      { label:'Lương & thưởng', href:'/luong',     icon:'clock' },
      { label:'Tuyển dụng',     href:'/tuyendung', icon:'arrow', badge:{ text:'5', variant:'amber' as const } },
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
