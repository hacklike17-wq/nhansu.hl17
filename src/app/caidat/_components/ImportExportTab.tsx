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
  HardDriveDownload,
  HardDriveUpload,
  Archive,
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

type BackupScope = 'all' | 'salary-config' | 'hr'
type RestorePreview = {
  ok: boolean
  dryRun?: boolean
  fileInfo?: {
    version: string
    exportedAt: string
    scope: string
    fromCompany: string
    crossCompany: boolean
  }
  summary?: Record<string, { count: number; applied: boolean }>
  warnings?: string[]
  message?: string
  error?: string
}

const BACKUP_META: Record<BackupScope, { label: string; desc: string }> = {
  all:             { label: 'Toàn bộ hệ thống', desc: 'Công ty, cột lương, thuế/BH, nhân viên, user, phân quyền' },
  'salary-config': { label: 'Cấu hình lương',   desc: 'Công ty, cài đặt, cột lương + version, PIT, BH' },
  hr:              { label: 'Nhân sự',           desc: 'Nhân viên, user (không kèm mật khẩu), nhóm quyền' },
}

const RESTORE_SECTION_LABELS: Record<string, string> = {
  company:              'Công ty',
  companySettings:      'Cài đặt công ty',
  salaryColumns:        'Cột lương',
  salaryColumnVersions: 'Phiên bản cột lương',
  pitBrackets:          'Bậc thuế TNCN',
  insuranceRates:       'Tỷ lệ bảo hiểm',
  employees:            'Nhân viên',
  users:                'Tài khoản',
  permissionGroups:     'Nhóm quyền',
}

export default function ImportExportTab() {
  const defaultMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(defaultMonth)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [response, setResponse] = useState<ImportResponse | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [enabled, setEnabled] = useState<Set<SheetType>>(new Set())

  // ─── Backup / Restore state ─────────────────────────────────────────────
  const [restoreAnalyzing, setRestoreAnalyzing] = useState(false)
  const [restoreCommitting, setRestoreCommitting] = useState(false)
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)

  function downloadBackup(scope: BackupScope) {
    window.location.href = `/api/backup/export?scope=${scope}`
  }

  async function handleRestoreFileChosen(file: File) {
    setRestorePreview(null)
    setRestoreFile(file)
    setRestoreAnalyzing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/backup/import', { method: 'POST', body: fd })
      const data: RestorePreview = await res.json()
      setRestorePreview(data)
    } catch (e: any) {
      setRestorePreview({ ok: false, error: e?.message ?? 'Lỗi kết nối' })
    } finally {
      setRestoreAnalyzing(false)
    }
  }

  async function confirmRestore() {
    if (!restoreFile || !restorePreview?.ok || !restorePreview.summary) return
    const total = Object.values(restorePreview.summary).reduce((s, v) => s + v.count, 0)
    const sections = Object.entries(restorePreview.summary)
      .map(([k, v]) => `  • ${RESTORE_SECTION_LABELS[k] ?? k}: ${v.count}`)
      .join('\n')
    const crossWarning = restorePreview.fileInfo?.crossCompany
      ? '\n⚠ File backup này export từ công ty KHÁC. Nếu tiếp tục, dữ liệu sẽ được khôi phục vào công ty hiện tại.\n'
      : ''
    if (!window.confirm(
      `Khôi phục ${total} bản ghi vào DB?\n\n` +
      sections +
      `\n\nFile được xuất lúc: ${restorePreview.fileInfo?.exportedAt ?? '—'}` +
      crossWarning +
      `\n\nLưu ý:\n` +
      `• Ghi đè theo key ổn định (email / mã NV / tên cột…)\n` +
      `• KHÔNG đụng vào dữ liệu tháng (chấm công, lương, audit log…)\n` +
      `• Không thể undo nếu không có backup khác`
    )) return

    setRestoreCommitting(true)
    try {
      const fd = new FormData()
      fd.append('file', restoreFile)
      fd.append('commit', '1')
      const res = await fetch('/api/backup/import', { method: 'POST', body: fd })
      const data: RestorePreview = await res.json()
      setRestorePreview(data)
      if (data.ok && !data.dryRun) {
        setRestoreFile(null)
      }
    } catch (e: any) {
      setRestorePreview({ ok: false, error: e?.message ?? 'Lỗi kết nối' })
    } finally {
      setRestoreCommitting(false)
    }
  }

  function resetRestore() {
    setRestorePreview(null)
    setRestoreFile(null)
  }

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

    // Safeguard — force the user to re-read which month the data will land
    // in. Without this it's easy to click "Xác nhận" while the picker is
    // still on last month's value and silently corrupt that month's rows.
    const totalRows =
      response?.sheets
        ?.filter(s => enabled.has(s.sheetType))
        .reduce((sum, s) => sum + s.summary.toUpsert, 0) ?? 0
    const sheetLabels = Array.from(enabled)
      .map(t => TYPE_META[t].label)
      .join(' + ')
    const ok = window.confirm(
      `Nạp ${totalRows} bản ghi vào THÁNG ${month}?\n\n` +
        `Loại dữ liệu: ${sheetLabels}\n` +
        `Nhắc: dữ liệu sẽ ghi vào ĐÚNG tháng bạn đã chọn ở trên, không phải tháng trong file.\n\n` +
        `Bấm OK để xác nhận, Cancel để quay lại chỉnh picker tháng.`
    )
    if (!ok) return

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

                      {sheet.errors.length > 0 && (
                        <details open className="px-4 pb-2">
                          <summary className="text-[11px] text-red-700 font-semibold cursor-pointer">
                            ▶ {sheet.errors.length} dòng lỗi
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-[10px] text-red-600 max-h-48 overflow-y-auto bg-red-50 px-2 py-1 rounded">
                            {sheet.errors.slice(0, 50).map((er, i) => (
                              <li key={i}>
                                <span className="font-mono text-red-400">R{er.row}</span> · {er.message}
                              </li>
                            ))}
                            {sheet.errors.length > 50 && (
                              <li className="italic text-red-400">... +{sheet.errors.length - 50} dòng lỗi nữa</li>
                            )}
                          </ul>
                        </details>
                      )}

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

      {/* ─── Sao lưu / Khôi phục hệ thống ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4 pb-3 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Archive size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Sao lưu / Khôi phục hệ thống</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Backup dữ liệu setup (công ty, cột lương, nhân viên…) dưới dạng JSON để phòng
              khi xoá nhầm. KHÔNG bao gồm dữ liệu tháng (chấm công, lương, audit log).
            </p>
          </div>
        </div>

        {/* Xuất */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <HardDriveDownload size={12} /> Xuất backup (tải về máy)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(['all', 'salary-config', 'hr'] as BackupScope[]).map(scope => (
              <button
                key={scope}
                onClick={() => downloadBackup(scope)}
                className="text-left border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50/30 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Download size={12} className="text-purple-600" />
                  <span className="text-xs font-semibold text-gray-900">{BACKUP_META[scope].label}</span>
                </div>
                <div className="text-[10px] text-gray-500 leading-snug">
                  {BACKUP_META[scope].desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Nhập */}
        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <HardDriveUpload size={12} /> Khôi phục từ file JSON
          </div>

          {!restoreFile && !restorePreview && (
            <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-purple-600 text-white rounded-lg cursor-pointer hover:bg-purple-700">
              <Upload size={13} /> {restoreAnalyzing ? 'Đang phân tích...' : 'Chọn file JSON...'}
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                disabled={restoreAnalyzing || restoreCommitting}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleRestoreFileChosen(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}

          {restorePreview && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {restorePreview.ok ? (
                <>
                  <div className="px-4 py-3 bg-purple-50 border-b border-purple-200 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-[11px]">
                      <Check size={13} className="text-purple-600" />
                      <span className="font-semibold text-purple-900">
                        {restorePreview.dryRun ? 'Preview sẵn sàng' : 'Đã khôi phục'}
                      </span>
                      {restorePreview.fileInfo && (
                        <span className="text-purple-700">
                          · {restorePreview.fileInfo.fromCompany} · xuất lúc{' '}
                          {new Date(restorePreview.fileInfo.exportedAt).toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={resetRestore}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] border border-gray-200 rounded hover:bg-white"
                      >
                        <X size={11} /> Đóng
                      </button>
                      {restorePreview.dryRun && (
                        <button
                          onClick={confirmRestore}
                          disabled={restoreCommitting}
                          className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-60"
                        >
                          {restoreCommitting ? 'Đang khôi phục...' : 'Khôi phục'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    {restorePreview.fileInfo?.crossCompany && (
                      <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>
                          File được xuất từ công ty <b>{restorePreview.fileInfo.fromCompany}</b>.
                          Dữ liệu sẽ được khôi phục vào công ty hiện tại (companyId được remap).
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {restorePreview.summary &&
                        Object.entries(restorePreview.summary).map(([k, v]) => (
                          <div key={k} className="border border-gray-100 rounded px-3 py-2 bg-gray-50/50">
                            <div className="text-[10px] text-gray-500">
                              {RESTORE_SECTION_LABELS[k] ?? k}
                            </div>
                            <div className="text-sm font-bold text-gray-900">{v.count}</div>
                          </div>
                        ))}
                    </div>
                    {restorePreview.warnings && restorePreview.warnings.length > 0 && (
                      <div className="mt-3 border border-amber-200 bg-amber-50 rounded p-2">
                        <div className="text-[11px] font-semibold text-amber-800 mb-1">
                          Cảnh báo:
                        </div>
                        <ul className="text-[10px] text-amber-700 space-y-0.5">
                          {restorePreview.warnings.slice(0, 10).map((w, i) => (
                            <li key={i}>· {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {restorePreview.message && !restorePreview.dryRun && (
                      <div className="mt-3 text-[11px] text-green-700 font-medium">
                        {restorePreview.message}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-4 bg-red-50 border-b border-red-200">
                  <div className="flex items-start gap-2 text-[11px] text-red-700">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Không thể phân tích file</div>
                      <div className="text-red-600 mt-0.5">{restorePreview.error}</div>
                    </div>
                  </div>
                  <button
                    onClick={resetRestore}
                    className="mt-2 text-[11px] text-red-700 underline"
                  >
                    Chọn file khác
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
