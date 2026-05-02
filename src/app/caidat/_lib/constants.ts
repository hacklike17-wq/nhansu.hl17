/**
 * Constants for the Cài đặt page.
 * Extracted from page.tsx for readability — no logic changes.
 */

export const AVATAR_COLORS = [
  'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-amber-600',
  'bg-pink-600', 'bg-cyan-600', 'bg-red-500', 'bg-indigo-600',
]

export const STATUS_BADGE: Record<string, string> = {
  WORKING:  'bg-green-50 text-green-700 border-green-200',
  HALF:     'bg-amber-50 text-amber-700 border-amber-200',
  LEAVE:    'bg-red-50 text-red-700 border-red-200',
  REMOTE:   'bg-blue-50 text-blue-700 border-blue-200',
  RESIGNED: 'bg-gray-100 text-gray-500 border-gray-200',
}

export const STATUS_LABEL: Record<string, string> = {
  WORKING:  'Đang làm',
  HALF:     'Nửa ngày',
  LEAVE:    'Nghỉ phép',
  REMOTE:   'Remote',
  RESIGNED: 'Đã nghỉ',
}

export const CONTRACT_MAP: Record<string, string> = {
  FULL_TIME: 'Toàn thời gian',
  PART_TIME: 'Bán thời gian',
  INTERN:    'Thực tập',
  FREELANCE: 'Freelance',
}

/* ─── Employee form shape for add/edit ─── */
export type EmpForm = {
  fullName: string
  email: string
  phone: string
  dob: string
  gender: string
  department: string
  position: string
  contractType: string
  startDate: string
  baseSalary: number
  responsibilitySalary: number
  excludeFromPayroll: boolean
  address: string
  workStartTime: string
  workEndTime: string
  accountStatus: string
  accountPassword: string
}

export const EMPTY_FORM: EmpForm = {
  fullName: '',
  email: '',
  phone: '',
  dob: '',
  gender: 'male',
  department: '',
  position: '',
  contractType: 'FULL_TIME',
  startDate: '',
  baseSalary: 0,
  responsibilitySalary: 0,
  excludeFromPayroll: false,
  address: '',
  workStartTime: '',
  workEndTime: '',
  accountStatus: 'ACTIVE',
  accountPassword: '',
}
