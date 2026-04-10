'use client'
import PageShell from '@/components/layout/PageShell'
import { RECRUITMENT_DATA } from '@/constants/data'
import { Briefcase, Users, CheckCircle, Clock } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  open:         { label: 'Đang mở',     cls: 'bg-green-50 text-green-700 border-green-200' },
  interviewing: { label: 'Phỏng vấn',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  closed:       { label: 'Đã đóng',     cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  cancelled:    { label: 'Hủy',         cls: 'bg-red-50 text-red-600 border-red-200' },
}

export default function TuyenDungPage() {
  const totalPositions = RECRUITMENT_DATA.reduce((s, r) => s + r.quantity, 0)
  const totalApplicants = RECRUITMENT_DATA.reduce((s, r) => s + r.applicants, 0)
  const totalPassed = RECRUITMENT_DATA.reduce((s, r) => s + r.passed, 0)

  return (
    <PageShell breadcrumb="Nhân sự" title="Tuyển dụng">
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <Briefcase size={16}/>, label: 'Vị trí đang tuyển', value: RECRUITMENT_DATA.filter(r => r.status !== 'closed').length, color: 'text-blue-600 bg-blue-50' },
          { icon: <Users size={16}/>, label: 'Tổng ứng viên', value: totalApplicants, color: 'text-purple-600 bg-purple-50' },
          { icon: <CheckCircle size={16}/>, label: 'Đã đạt', value: totalPassed, color: 'text-green-600 bg-green-50' },
          { icon: <Clock size={16}/>, label: 'Cần tuyển', value: totalPositions, color: 'text-amber-600 bg-amber-50' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
            <div>
              <div className="text-[11px] text-gray-500">{s.label}</div>
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {RECRUITMENT_DATA.map(r => {
          const st = STATUS_MAP[r.status]
          const pct = r.quantity > 0 ? Math.round((r.passed / r.quantity) * 100) : 0
          return (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{r.position}</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">{r.department} · {r.level} · {r.salaryRange}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
              </div>
              <p className="text-xs text-gray-600 mb-3">{r.description}</p>
              <div className="flex items-center gap-6 text-xs text-gray-500 mb-3">
                <span>Cần tuyển: <strong className="text-gray-900">{r.quantity}</strong></span>
                <span>Ứng viên: <strong className="text-gray-900">{r.applicants}</strong></span>
                <span>Phỏng vấn: <strong className="text-gray-900">{r.interviewed}</strong></span>
                <span>Đạt: <strong className="text-green-600">{r.passed}</strong></span>
                <span>Hạn: <strong className="text-gray-900">{r.deadline}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <span className="text-[11px] font-bold text-gray-600">{pct}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </PageShell>
  )
}
