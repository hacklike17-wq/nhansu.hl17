import { cn } from '@/lib/utils'
import { EMPLOYEE_DATA } from '@/constants/data'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  working:  { label: 'Đang làm',  cls: 'bg-green-50 text-green-700' },
  half:     { label: 'Nửa ngày',  cls: 'bg-amber-50 text-amber-700' },
  leave:    { label: 'Nghỉ phép', cls: 'bg-red-50 text-red-600'   },
  remote:   { label: 'Remote',    cls: 'bg-blue-50 text-blue-600'  },
  resigned: { label: 'Đã nghỉ',   cls: 'bg-gray-100 text-gray-500' },
}

const DEPT_COLOR: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
  green:  'bg-green-50 text-green-700',
  amber:  'bg-amber-50 text-amber-700',
}

export default function EmployeeTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {['Họ tên', 'Bộ phận', 'Trạng thái', 'Công hôm nay', 'Lương cơ bản'].map((h, i) => (
              <th key={h} className={cn(
                'pb-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide text-left pr-2',
                i === 4 && 'text-right pr-0'
              )}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EMPLOYEE_DATA.map((emp) => {
            const status = STATUS_MAP[emp.status]
            return (
              <tr key={emp.id} className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                <td className="py-2.5 pr-2">
                  <div className="text-[12.5px] font-semibold text-gray-900">{emp.name}</div>
                  <div className="text-[11px] text-gray-400">{emp.role}</div>
                </td>
                <td className="py-2.5 pr-2">
                  <span className={cn('inline-block px-2 py-0.5 rounded-[5px] text-[11px] font-semibold', DEPT_COLOR[emp.deptColor])}>
                    {emp.department}
                  </span>
                </td>
                <td className="py-2.5 pr-2">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', status.cls)}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {status.label}
                  </span>
                </td>
                <td className="py-2.5 pr-2 text-[13px] font-medium text-gray-900">
                  {emp.hours}
                </td>
                <td className="py-2.5 text-right text-[13px] font-semibold text-gray-900 tabular-nums">
                  {emp.salary.toLocaleString('vi-VN')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
