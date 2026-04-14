'use client'
/**
 * /caidat → tab "Import / Export" — unified multi-sheet upload.
 *
 * One .xlsx upload can contain any subset of chấm công / tăng ca / KPI
 * sheets — the server detects sheet types by name and returns a
 * per-sheet summary. User reviews the preview, unchecks any sheet they
 * don't want to write, and hits "Xác nhận" to commit in a single tx.
 */
import { useState } from 'react'
import {
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Check,
  X,
  Clock,
  AlertOctagon,
} from 'lucide-react'

type SheetType = 'work-units' | 'overtime' | 'kpi'

type SheetReport = {
  sheetName: string
  sheetType: SheetType
  summary: {
    parsed: number
    toUpsert: number
    skipped: number
    errors: number
  }
  monthMatches: boolean
  ready?: boolean
  blockedReason?: string | null
  errors: Array<{ row: number; message: string }>
  skipped: Array<{ row: number; reason: string }>
  preview: Array<{
    empName: string
    date: string
    units?: number
    hours?: number
    types?: string[]
    note?: string | null
  }>
}

type ImportResponse = {
  ok: boolean
  dryRun?: boolean
  month?: string
  sheets?: SheetReport[]
  unrecognized?: string[]
  message?: string
  error?: string
}

const TYPE_META: Record<SheetType, { label: string; icon: React.ReactNode; color: string }> = {
  'work-units': { label: 'Chấm công', icon: <FileSpreadsheet size={14} />, color: 'blue' },
  overtime: { label: 'Tăng ca', icon: <Clock size={14} />, color: 'orange' },
  kpi: { label: 'KPI vi phạm', icon: <AlertOctagon size={14} />, color: 'rose' },
}

export default function ImportExportTab() {
  const defaultMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(defaultMonth)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [response, setResponse] = useState<ImportResponse | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [enabled, setEnabled] = useState<Set<SheetType>>(new Set())

  function downloadTemplate(kind: SheetType) {
    const path =
      kind === 'work-units' ? 'work-units' :
      kind === 'overtime' ? 'overtime' :
      'kpi-violations'
    window.location.href = `/api/data/${path}/template?month=${month}`
  }
  function downloadExport(kind: SheetType) {
    const path =
      kind === 'work-units' ? 'work-units' :
      kind === 'overtime' ? 'overtime' :
      'kpi-violations'
    window.location.href = `/api/data/${path}/export?month=${month}`
  }

  async function handleFileChosen(file: File) {
    setResponse(null)
    setPendingFile(file)
    setAnalyzing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('month', month)
      const res = await fetch('/api/data/all/import', {
        method: 'POST',
        body: fd,
      })
      const data: ImportResponse = await res.json()
      setResponse(data)
      // Pre-check every "ready" sheet — the server computes this flag so we
      // don't have to duplicate the readiness logic on the client.
      if (data.ok && data.sheets) {
        setEnabled(
          new Set(data.sheets.filter(s => s.ready).map(s => s.sheetType))
        )
      } else {
        setEnabled(new Set())
      }
    } catch (e: any) {
      setResponse({ ok: false, error: e?.message ?? 'Lỗi kết nối' })
    } finally {
      setAnalyzing(false)
    }
  }

  async function confirmCommit() {
    if (!pendingFile || enabled.size === 0) return
    setCommitting(true)
    try {
      const fd = new FormData()
      fd.append('file', pendingFile)
      fd.append('month', month)
      fd.append('commit', '1')
      fd.append('enabled', JSON.stringify(Array.from(enabled)))
      const res = await fetch('/api/data/all/import', {
        method: 'POST',
        body: fd,
      })
      const data: ImportResponse = await res.json()
      setResponse(data)
      if (data.ok && !data.dryRun) {
        setPendingFile(null)
      }
    } catch (e: any) {
      setResponse({ ok: false, error: e?.message ?? 'Lỗi kết nối' })
    } finally {
      setCommitting(false)
    }
  }

  function reset() {
    setResponse(null)
    setPendingFile(null)
    setEnabled(new Set())
  }

  function toggleSheet(t: SheetType) {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
        <Database size={16} className="text-blue-600" />
        <div className="flex-1">
          <div className="text-sm font-bold text-gray-900">Import / Export dữ liệu</div>
          <div className="text-[11px] text-gray-500">
            Upload 1 file Excel chứa nhiều sheet — hệ thống tự nhận diện chấm công / tăng ca / KPI.
            Format: matrix hàng-NV × cột-ngày (giống bảng chấm công hiện có).
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

      {/* Xuất templates / Xuất hiện có — 1 nhóm button cho 3 loại */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Xuất ra Excel</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['work-units', 'overtime', 'kpi'] as SheetType[]).map(t => (
            <div key={t} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-7 h-7 rounded-lg bg-${TYPE_META[t].color}-50 text-${TYPE_META[t].color}-600 flex items-center justify-center`}>
                  {TYPE_META[t].icon}
                </span>
                <span className="text-xs font-semibold text-gray-900">{TYPE_META[t].label}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => downloadTemplate(t)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 border border-gray-200 rounded hover:bg-gray-50 justify-center"
                >
                  <Download size={11} /> Template rỗng
                </button>
                <button
                  onClick={() => downloadExport(t)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 border border-gray-200 rounded hover:bg-gray-50 justify-center"
                >
                  <Download size={11} /> Dữ liệu hiện tại
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upload section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Import từ Excel</h3>
        <p className="text-[11px] text-gray-500 mb-3">
          Chọn 1 file .xlsx. Hệ thống sẽ phân tích TẤT CẢ sheet, báo cáo từng cái, rồi bạn
          chọn sheet nào muốn ghi vào DB.
        </p>

        <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
          <Upload size={13} /> {analyzing ? 'Đang phân tích...' : 'Chọn file Excel...'}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={analyzing || committing}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFileChosen(f)
              e.target.value = ''
            }}
          />
        </label>

        {/* Response display */}
        {response && (
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            {response.ok ? (
              <>
                <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    <span className="text-xs font-semibold text-green-900">
                      {response.dryRun
                        ? `Đã phân tích ${response.sheets?.length ?? 0} sheet — chọn sheet muốn ghi rồi bấm xác nhận`
                        : response.message ?? 'Import thành công'}
                    </span>
                  </div>
                  <button onClick={reset} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>

                {response.unrecognized && response.unrecognized.length > 0 && (
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] text-gray-500">
                    Đã bỏ qua {response.unrecognized.length} sheet không liên quan:{' '}
                    {response.unrecognized.slice(0, 5).join(', ')}
                    {response.unrecognized.length > 5 && '…'}
                  </div>
                )}

                {response.sheets?.map(sheet => {
                  const meta = TYPE_META[sheet.sheetType]
                  const isEnabled = enabled.has(sheet.sheetType)
                  const isReady = sheet.ready ?? false
                  return (
                    <div
                      key={sheet.sheetName}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <div className="px-4 py-3 flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isEnabled && isReady}
                          disabled={!isReady || committing || !response.dryRun}
                          onChange={() => toggleSheet(sheet.sheetType)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500/20"
                        />
                        <span className={`w-7 h-7 rounded-lg bg-${meta.color}-50 text-${meta.color}-600 flex items-center justify-center shrink-0`}>
                          {meta.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-900 truncate">
                            {meta.label}
                            <span className="text-gray-400 font-normal ml-1.5">
                              · "{sheet.sheetName}"
                            </span>
                            {!isReady && sheet.blockedReason && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[9px] font-semibold">
                                KHÔNG THỂ GHI
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {sheet.summary.toUpsert} ghi ·{' '}
                            {sheet.summary.skipped} bỏ qua ·{' '}
                            <span className={sheet.summary.errors > 0 ? 'text-red-600 font-semibold' : ''}>
                              {sheet.summary.errors} lỗi
                            </span>
                            {' · '}
                            {sheet.summary.parsed} cells đọc
                          </div>
                          {!isReady && sheet.blockedReason && (
                            <div className="text-[10px] text-red-600 mt-0.5">
                              ⚠ {sheet.blockedReason}
                            </div>
                          )}
                        </div>
                      </div>

                      {sheet.skipped.length > 0 && (
                        <details className="px-4 pb-2">
                          <summary className="text-[11px] text-amber-700 cursor-pointer">
                            {sheet.skipped.length} dòng bỏ qua
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-[10px] text-gray-600 max-h-32 overflow-y-auto">
                            {sheet.skipped.map((s, i) => (
                              <li key={i}>
                                <span className="font-mono text-gray-400">R{s.row}</span> · {s.reason}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {sheet.preview.length > 0 && (
                        <details className="px-4 pb-3">
                          <summary className="text-[11px] text-gray-600 cursor-pointer">
                            Xem trước 20 bản ghi đầu
                          </summary>
                          <div className="mt-1 overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="border-b border-gray-100 text-gray-400">
                                  <th className="text-left py-1 px-2">NV</th>
                                  <th className="text-left py-1 px-2">Ngày</th>
                                  <th className="text-right py-1 px-2">Giá trị</th>
                                  <th className="text-left py-1 px-2">Ghi chú</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sheet.preview.map((p, i) => (
                                  <tr key={i} className="border-b border-gray-50">
                                    <td className="py-0.5 px-2 truncate max-w-[140px]">{p.empName}</td>
                                    <td className="py-0.5 px-2 font-mono">{p.date}</td>
                                    <td className="py-0.5 px-2 text-right tabular-nums">
                                      {p.units != null && `${p.units} công`}
                                      {p.hours != null && `${p.hours}h`}
                                      {p.types && p.types.join(',')}
                                    </td>
                                    <td className="py-0.5 px-2 text-gray-400">{p.note ?? ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  )
                })}

                {response.dryRun && pendingFile && (
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
                      disabled={committing || enabled.size === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                    >
                      <Check size={12} />
                      {committing
                        ? 'Đang ghi...'
                        : `Xác nhận ghi ${enabled.size} sheet`}
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
                      {response.error ?? 'File không hợp lệ'}
                    </span>
                  </div>
                  <button onClick={reset} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
                {response.sheets?.map(sheet => (
                  <div key={sheet.sheetName} className="px-4 py-2 border-b border-gray-100 last:border-0">
                    <div className="text-[11px] font-semibold text-gray-800">
                      {TYPE_META[sheet.sheetType]?.label ?? sheet.sheetType} · "{sheet.sheetName}"
                    </div>
                    {sheet.errors.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[10px] text-red-600 max-h-32 overflow-y-auto">
                        {sheet.errors.slice(0, 30).map((er, i) => (
                          <li key={i}>
                            <span className="font-mono text-red-400">R{er.row}</span> · {er.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
