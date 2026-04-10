'use client'
import { useState } from 'react'
import PageShell from '@/components/layout/PageShell'
import { COMPANY_SETTINGS, SYSTEM_CONFIG } from '@/constants/data'
import { Building2, Settings, Calculator } from 'lucide-react'

export default function CaiDatPage() {
  const [tab, setTab] = useState<'company' | 'system' | 'salary'>('company')

  return (
    <PageShell breadcrumb="Hệ thống" title="Cài đặt">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 border border-gray-200 rounded-xl p-1 w-fit">
        {([
          ['company', 'Thông tin công ty', <Building2 key="b" size={13}/>],
          ['system', 'Hệ thống', <Settings key="s" size={13}/>],
          ['salary', 'Cấu hình lương', <Calculator key="c" size={13}/>],
        ] as [string, string, React.ReactNode][]).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === key ? 'bg-white text-gray-900 font-semibold border border-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Thông tin doanh nghiệp</h3>
          <div className="grid grid-cols-2 gap-4">
            {([
              ['Tên công ty', COMPANY_SETTINGS.name],
              ['Mã số thuế', COMPANY_SETTINGS.taxCode],
              ['Giám đốc', COMPANY_SETTINGS.director],
              ['Ngày thành lập', COMPANY_SETTINGS.foundedDate],
              ['Địa chỉ', COMPANY_SETTINGS.address],
              ['Điện thoại', COMPANY_SETTINGS.phone],
              ['Email', COMPANY_SETTINGS.email],
              ['Website', COMPANY_SETTINGS.website],
              ['Ngân hàng', COMPANY_SETTINGS.bankName],
              ['Số tài khoản', COMPANY_SETTINGS.bankAccount],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
                <input
                  defaultValue={value}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          <button className="mt-6 px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
            Lưu thay đổi
          </button>
        </div>
      )}

      {tab === 'system' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Cấu hình hệ thống</h3>
          <div className="grid grid-cols-2 gap-4">
            {([
              ['Giờ làm/ngày', SYSTEM_CONFIG.workHoursPerDay],
              ['Ngày làm/tuần', SYSTEM_CONFIG.workDaysPerWeek],
              ['Hệ số OT', SYSTEM_CONFIG.overtimeRate],
              ['Hệ số ngày lễ', SYSTEM_CONFIG.holidayRate],
              ['Ngày phép/năm', SYSTEM_CONFIG.leavePerYear],
              ['Tiền tệ', SYSTEM_CONFIG.currency],
            ] as [string, string | number][]).map(([label, value]) => (
              <div key={label}>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
                <input
                  defaultValue={String(value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          <button className="mt-6 px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
            Lưu thay đổi
          </button>
        </div>
      )}

      {tab === 'salary' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Cấu hình bảo hiểm & thuế</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">BHXH (%)</label>
              <input defaultValue={SYSTEM_CONFIG.socialInsuranceRate * 100} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">BHYT (%)</label>
              <input defaultValue={SYSTEM_CONFIG.healthInsuranceRate * 100} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">BHTN (%)</label>
              <input defaultValue={SYSTEM_CONFIG.unemploymentInsuranceRate * 100} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs" />
            </div>
          </div>

          <h4 className="text-xs font-bold text-gray-900 mb-3">Bảng thuế TNCN</h4>
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 font-semibold text-gray-500">Từ (VND)</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-500">Đến (VND)</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500">Thuế suất</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_CONFIG.taxBrackets.map((b, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-700">{b.from.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-2 text-gray-700">{b.to === Infinity ? '∞' : b.to.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">{b.rate * 100}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="mt-6 px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
            Lưu thay đổi
          </button>
        </div>
      )}
    </PageShell>
  )
}
