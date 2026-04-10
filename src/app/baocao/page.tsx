'use client'
import PageShell from '@/components/layout/PageShell'
import { REPORT_DATA } from '@/constants/data'
import { FileText, Download, Loader2, AlertCircle } from 'lucide-react'

const STATUS_MAP: Record<string, { icon: React.ReactNode; cls: string }> = {
  ready:      { icon: <FileText size={14}/>,       cls: 'text-green-600 bg-green-50' },
  generating: { icon: <Loader2 size={14} className="animate-spin"/>, cls: 'text-blue-600 bg-blue-50' },
  error:      { icon: <AlertCircle size={14}/>,    cls: 'text-red-600 bg-red-50' },
}

const TYPE_MAP: Record<string, { label: string; cls: string }> = {
  financial:   { label: 'Tài chính',  cls: 'bg-blue-50 text-blue-700' },
  hr:          { label: 'Nhân sự',    cls: 'bg-purple-50 text-purple-700' },
  operational: { label: 'Vận hành',   cls: 'bg-amber-50 text-amber-700' },
}

export default function BaoCaoPage() {
  return (
    <PageShell breadcrumb="Tổng quan" title="Báo cáo">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Tổng báo cáo', value: REPORT_DATA.length },
          { label: 'Sẵn sàng', value: REPORT_DATA.filter(r => r.status === 'ready').length },
          { label: 'Đang tạo', value: REPORT_DATA.filter(r => r.status === 'generating').length },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[11px] text-gray-500">{s.label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {REPORT_DATA.map(r => {
          const st = STATUS_MAP[r.status]
          const tp = TYPE_MAP[r.type]
          return (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 hover:border-blue-200 transition-colors">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${st.cls}`}>
                {st.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-[13px] font-bold text-gray-900">{r.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${tp.cls}`}>{tp.label}</span>
                  <span className="text-[11px] text-gray-400">{r.period} · Tạo bởi {r.generatedBy}</span>
                </div>
              </div>
              <div className="text-[11px] text-gray-400">
                {new Date(r.generatedAt).toLocaleString('vi-VN')}
              </div>
              {r.status === 'ready' && (
                <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                  <Download size={13} /> Tải xuống
                </button>
              )}
              {r.status === 'generating' && (
                <span className="text-xs text-blue-500 font-medium">Đang tạo...</span>
              )}
            </div>
          )
        })}
      </div>
    </PageShell>
  )
}
