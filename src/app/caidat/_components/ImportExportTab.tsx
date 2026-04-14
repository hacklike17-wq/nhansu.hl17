'use client'
/**
 * /caidat → tab "Import / Export" — Phase 1 MVP: only chấm công (work_units).
 *
 * 3 actions per module:
 *   - Xuất template: blank .xlsx pre-filled with employee list for the month
 *   - Xuất dữ liệu hiện có: dump current DB rows to the same matrix format
 *   - Import từ Excel: upload → server parses + validates → shows preview
 *     → user confirms → server commits in a transaction
 *
 * Phase 2 (tăng ca, KPI, lương tay, nhân viên) will reuse this same shape.
 */
import { useState } from 'react'
import { Database, Download, Upload, FileSpreadsheet, AlertTriangle, Check, X } from 'lucide-react'

type PreviewResponse = {
  ok: boolean
  dryRun?: boolean
  sheetName?: string
  month?: string
  summary?: {
    parsed: number
    toUpsert: number
    skipped: number
    errors: number
  }
  skipped?: Array<{ row: number; reason: string }>
  errors?: Array<{ row: number; col?: number; message: string }>
  preview?: Array<{ empName: string; date: string; units: number; note: string | null }>
  message?: string
  error?: string
}

export default function ImportExportTab() {
  const defaultMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(defaultMonth)
  const [importing, setImporting] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  function downloadTemplate() {
    window.location.href = `/api/data/work-units/template?month=${month}`
  }
  function downloadExport() {
    window.location.href = `/api/data/work-units/export?month=${month}`
  }

  async function handleFileChosen(file: File) {
    setPreview(null)
    setPendingFile(file)
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('month', month)
      // dry-run first
      const res = await fetch('/api/data/work-units/import', {
        method: 'POST',
        body: fd,
      })
      const data: PreviewResponse = await res.json()
      setPreview(data)
    } catch (e: any) {
      setPreview({ ok: false, error: e?.message ?? 'Lỗi kết nối' })
    } finally {
      setImporting(false)
    }
  }

  async function confirmCommit() {
    if (!pendingFile) return
    setCommitting(true)
    try {
      const fd = new FormData()
      fd.append('file', pendingFile)
      fd.append('month', month)
      fd.append('commit', '1')
      const res = await fetch('/api/data/work-units/import', {
        method: 'POST',
        body: fd,
      })
      const data: PreviewResponse = await res.json()
      setPreview(data)
      if (data.ok && !data.dryRun) {
        setPendingFile(null)
      }
    } catch (e: any) {
      setPreview({ ok: false, error: e?.message ?? 'Lỗi kết nối' })
    } finally {
      setCommitting(false)
    }
  }

  function reset() {
    setPreview(null)
    setPendingFile(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Month picker — shared across all modules */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
        <Database size={16} className="text-blue-600" />
        <div className="flex-1">
          <div className="text-sm font-bold text-gray-900">Import / Export dữ liệu</div>
          <div className="text-[11px] text-gray-500">
            Xuất template để nhập tay trên Excel, hoặc import file từ bảng chấm công có sẵn của bạn.
          </div>
        </div>
        <label className="text-xs font-medium text-gray-500">Tháng</label>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Section: Chấm công */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileSpreadsheet size={18} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900">Chấm công tháng</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Format: <strong>matrix hàng-NV × cột-ngày</strong> (giống "BẢNG CHẤM CÔNG"
              file Excel bạn đang dùng). Giá trị ô: <code className="px-1 bg-gray-100 rounded">0</code>,{' '}
              <code className="px-1 bg-gray-100 rounded">0.5</code>, <code className="px-1 bg-gray-100 rounded">1</code>,
              <code className="px-1 bg-gray-100 rounded">1.5</code>, <code className="px-1 bg-gray-100 rounded">2</code>… hoặc{' '}
              <code className="px-1 bg-gray-100 rounded">KL</code> (= không lương, lưu units=0 note="Nghỉ").
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download size={12} /> Xuất template rỗng
          </button>
          <button
            onClick={downloadExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download size={12} /> Xuất dữ liệu hiện tại
          </button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
            <Upload size={12} /> {importing ? 'Đang phân tích...' : 'Import từ Excel'}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={importing || committing}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFileChosen(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        {/* Preview panel */}
        {preview && (
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            {preview.ok ? (
              <>
                <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    <span className="text-xs font-semibold text-green-900">
                      {preview.dryRun ? 'Kết quả phân tích — xem lại rồi bấm xác nhận' : (preview.message ?? 'Import thành công')}
                    </span>
                  </div>
                  <button onClick={reset} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
                {preview.summary && (
                  <div className="px-4 py-3 grid grid-cols-4 gap-2 text-center bg-gray-50 border-b border-gray-100">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase">Ô đã đọc</div>
                      <div className="text-lg font-bold text-gray-900">{preview.summary.parsed}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase">Sẽ ghi DB</div>
                      <div className="text-lg font-bold text-blue-700">{preview.summary.toUpsert}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase">Bỏ qua</div>
                      <div className="text-lg font-bold text-amber-600">{preview.summary.skipped}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase">Lỗi</div>
                      <div className="text-lg font-bold text-red-600">{preview.summary.errors}</div>
                    </div>
                  </div>
                )}
                {preview.skipped && preview.skipped.length > 0 && (
                  <details className="px-4 py-2 border-b border-gray-100">
                    <summary className="text-xs font-semibold text-amber-700 cursor-pointer">
                      Chi tiết {preview.skipped.length} dòng bỏ qua
                    </summary>
                    <ul className="mt-2 space-y-1 text-[11px] text-gray-600">
                      {preview.skipped.slice(0, 50).map((s, i) => (
                        <li key={i}>
                          <span className="font-mono text-gray-400">R{s.row}</span> · {s.reason}
                        </li>
                      ))}
                      {preview.skipped.length > 50 && (
                        <li className="text-gray-400 italic">... +{preview.skipped.length - 50} dòng nữa</li>
                      )}
                    </ul>
                  </details>
                )}
                {preview.preview && preview.preview.length > 0 && (
                  <details open className="px-4 py-2">
                    <summary className="text-xs font-semibold text-gray-700 cursor-pointer">
                      Xem trước 30 bản ghi đầu tiên
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400">
                            <th className="text-left py-1 px-2">Nhân viên</th>
                            <th className="text-left py-1 px-2">Ngày</th>
                            <th className="text-right py-1 px-2">Công</th>
                            <th className="text-left py-1 px-2">Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.preview.map((p, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-1 px-2">{p.empName}</td>
                              <td className="py-1 px-2 font-mono">{p.date}</td>
                              <td className="py-1 px-2 text-right tabular-nums">{p.units}</td>
                              <td className="py-1 px-2 text-gray-400">{p.note ?? ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                {preview.dryRun && pendingFile && (
                  <div className="px-4 py-3 bg-blue-50 border-t border-blue-200 flex items-center justify-end gap-2">
                    <button
                      onClick={reset}
                      disabled={committing}
                      className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-white"
                    >
                      Huỷ
                    </button>
                    <button
                      onClick={confirmCommit}
                      disabled={committing}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                    >
                      <Check size={12} /> {committing ? 'Đang ghi...' : `Xác nhận ghi ${preview.summary?.toUpsert ?? 0} bản ghi`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-600" />
                    <span className="text-xs font-semibold text-red-900">
                      {preview.error ?? 'File không hợp lệ'}
                    </span>
                  </div>
                  <button onClick={reset} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
                {preview.errors && preview.errors.length > 0 && (
                  <ul className="px-4 py-2 space-y-1 text-[11px] text-red-700 max-h-48 overflow-y-auto">
                    {preview.errors.slice(0, 50).map((er, i) => (
                      <li key={i}>
                        <span className="font-mono text-red-400">R{er.row}</span> · {er.message}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Placeholder cards for Phase 2 modules — disabled buttons */}
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5">
        <div className="text-xs font-semibold text-gray-500 mb-2">Sắp có (Phase 2)</div>
        <div className="text-[11px] text-gray-500 leading-relaxed">
          Tăng ca · KPI vi phạm · Lương tay (phụ cấp / thưởng / chuyên cần) · Nhân viên master
          — sẽ dùng cùng UI này. Liên hệ admin để request.
        </div>
      </div>
    </div>
  )
}
