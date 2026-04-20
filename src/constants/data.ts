import type {
  CashflowItem, Department, Recruitment,
  RevenueRecord, ExpenseRecord, DebtRecord, BudgetRecord,
  ReportItem, CompanySettings, SystemConfig, PermissionGroup, SalaryColumn,
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

/* EMPLOYEES, DEFAULT_WORK_UNITS, ATTENDANCE_DATA, SALARY_DATA và LEAVE_DATA
   từng là mock data với PLAINTEXT PASSWORD trong source — đã xoá 2026-04-20
   (security audit). Dashboard thật fetch qua getDashboardData() + Prisma;
   seed production dùng prisma/seed-real.ts. */


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
