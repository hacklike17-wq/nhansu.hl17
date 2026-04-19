'use client'
import { useState, useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { RefreshCw, Save, AlertTriangle, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'

type Settings = {
  autoFillCronEnabled: boolean
  sheetSyncEnabled: boolean
  sheetUrl: string | null
  sheetMonth: string | null
  lastSync: {
    syncedAt: string
    status: 'ok' | 'error'
    syncedBy: string
    rowsAffected: Record<string, number> | null
    errorMessage: string | null
  } | null
}

type LogRow = {
  id: string
  month: string
  sheetUrl: string
  syncedAt: string
  syncedBy: string
  status: 'ok' | 'error'
  durationMs: number
  rowsAffected: Record<string, number>
  errorMessage: string | null
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Pretty-print the "syncedBy" field. Historical logs stored the raw cuid,
 * new logs store the email, cron runs store "cron". We just shorten the
 * non-email form so the table doesn't blow up.
 */
function fmtSyncedBy(v: string): string {
  if (v === 'cron') return 'cron'
  if (v.includes('@')) return v
  // cuid fallback — show abbreviated with tooltip elsewhere
  return `user…${v.slice(-6)}`
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}


export default function AttendanceConfigTab() {
  const { data: settings, mutate: mutateSettings } = useSWR<Settings>('/api/settings/attendance', fetcher)
  const { data: logsData, mutate: mutateLogs } = useSWR<{ rows: LogRow[] }>('/api/sheet-sync-logs?limit=10', fetcher)

  const [autoFillEnabled, setAutoFillEnabled] = useState(true)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetMonth, setSheetMonth] = useState(currentMonth())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!settings) return
    setAutoFillEnabled(settings.autoFillCronEnabled)
    setSyncEnabled(settings.sheetSyncEnabled)
    setSheetUrl(settings.sheetUrl ?? '')
    setSheetMonth(settings.sheetMonth ?? currentMonth())
    setDirty(false)
  }, [settings])

  function markDirty() { setDirty(true); setMessage(null) }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoFillCronEnabled: autoFillEnabled,
          sheetSyncEnabled: syncEnabled,
          sheetUrl: sheetUrl.trim() || null,
          sheetMonth: sheetMonth || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'error', text: data?.message ?? 'Lưu thất bại' })
      } else {
        setMessage({ kind: 'ok', text: 'Đã lưu cấu hình' })
        await mutateSettings()
        setDirty(false)
      }
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSyncNow() {
    setSyncing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/sync/google-sheet', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'error', text: data?.message ?? 'Sync thất bại' })
      } else {
        const r = data.rowsAffected ?? {}
        const total = (r.workUnit ?? 0) + (r.overtime ?? 0) + (r.kpi ?? 0)
        const warn = data.warnings?.length ? ` (${data.warnings.length} warning)` : ''
        setMessage({ kind: 'ok', text: `Đồng bộ xong ${total} dòng${warn}` })
        await mutateLogs()
        await mutateSettings()
        // Invalidate chamcong data so the table refreshes next time user visits
        await globalMutate(
          (key) => typeof key === 'string' && (key.startsWith('/api/work-units') || key.startsWith('/api/overtime') || key.startsWith('/api/kpi-violations')),
          undefined,
          { revalidate: true }
        )
      }
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setSyncing(false)
    }
  }

  const latestLog = logsData?.rows[0] ?? null
  const showErrorBanner = latestLog?.status === 'error'

  return (
    <div className="space-y-4 max-w-3xl">
      {showErrorBanner && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-red-900">Sync gần nhất thất bại ({fmtDateTime(latestLog!.syncedAt)})</div>
            <div className="text-red-700 mt-0.5">{latestLog!.errorMessage ?? 'Không rõ nguyên nhân'}</div>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-medium"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Auto-fill cron section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Auto-fill cron 18h</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Cron tự động điền 1 công cho các NV chưa chấm hôm nay (trừ Chủ nhật, NV đã nghỉ phép approved,
              và NV có payroll đã đóng sổ).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoFillEnabled}
            onClick={() => { setAutoFillEnabled(v => !v); markDirty() }}
            className={`shrink-0 relative inline-flex h-6 w-11 rounded-full transition-colors ${autoFillEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoFillEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Sheet sync section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Đồng bộ Google Sheet</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Kéo dữ liệu chấm công / tăng ca / KPI từ Google Sheet vào hệ thống.
              Cron chạy 19:00 mỗi ngày (trừ Chủ nhật). Mỗi tháng cần update link mới.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={syncEnabled}
            onClick={() => { setSyncEnabled(v => !v); markDirty() }}
            className={`shrink-0 relative inline-flex h-6 w-11 rounded-full transition-colors ${syncEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${syncEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className={syncEnabled ? '' : 'opacity-50 pointer-events-none'}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Link Google Sheet</label>
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => { setSheetUrl(e.target.value); markDirty() }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                💡 Sheet phải để public — Share → Anyone with link can view
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tháng áp dụng</label>
              <input
                type="month"
                value={sheetMonth}
                onChange={(e) => {
                  const newMonth = e.target.value
                  setSheetMonth(newMonth)
                  // Q12: đổi tháng → xoá link ngay trong UI, buộc admin dán link mới
                  if (newMonth !== (settings?.sheetMonth ?? currentMonth())) {
                    setSheetUrl('')
                  } else {
                    setSheetUrl(settings?.sheetUrl ?? '')
                  }
                  markDirty()
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 min-w-[200px]"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                💡 Đổi tháng sẽ reset link — dán lại link sheet tháng mới
              </p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`text-xs px-3 py-2 rounded-md ${message.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Lưu thiết lập
          </button>
          <button
            onClick={handleSyncNow}
            disabled={syncing || !settings?.sheetSyncEnabled || !settings?.sheetUrl || !settings?.sheetMonth}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Đồng bộ ngay
          </button>
        </div>

        {settings?.lastSync && (
          <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-100">
            Lần sync gần nhất: {fmtDateTime(settings.lastSync.syncedAt)} —{' '}
            {settings.lastSync.status === 'ok' ? (
              <span className="text-green-600 font-medium">✓ ok</span>
            ) : (
              <span className="text-red-600 font-medium">✗ lỗi</span>
            )}
            {' '}bởi <span className="font-medium" title={settings.lastSync.syncedBy}>{fmtSyncedBy(settings.lastSync.syncedBy)}</span>
          </div>
        )}
      </div>

      {/* Sync log history */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Lịch sử đồng bộ (10 gần nhất)</h3>
          <button onClick={() => mutateLogs()} className="text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
        {!logsData ? (
          <div className="p-5 text-xs text-gray-400">Đang tải…</div>
        ) : logsData.rows.length === 0 ? (
          <div className="p-5 text-xs text-gray-400">Chưa có lần sync nào</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                <th className="text-left px-3 py-2 font-medium">Tháng</th>
                <th className="text-left px-3 py-2 font-medium">Người</th>
                <th className="text-left px-3 py-2 font-medium">KQ</th>
                <th className="text-left px-3 py-2 font-medium">Chi tiết</th>
                <th className="text-right px-3 py-2 font-medium">Tg</th>
              </tr>
            </thead>
            <tbody>
              {logsData.rows.map(log => (
                <tr key={log.id} className="border-t border-gray-50">
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDateTime(log.syncedAt)}</td>
                  <td className="px-3 py-2 text-gray-700">{log.month}</td>
                  <td className="px-3 py-2 text-gray-600" title={log.syncedBy}>
                    {log.syncedBy === 'cron'
                      ? <span className="text-purple-600 font-medium">cron</span>
                      : <span className="truncate inline-block max-w-[200px] align-middle">{fmtSyncedBy(log.syncedBy)}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {log.status === 'ok' ? (
                      <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={12}/> ok</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700" title={log.errorMessage ?? ''}><XCircle size={12}/> err</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-[11px]">
                    {log.status === 'ok'
                      ? `WU ${log.rowsAffected?.workUnit ?? 0} · OT ${log.rowsAffected?.overtime ?? 0} · KPI ${log.rowsAffected?.kpi ?? 0}`
                      : <span className="text-red-600 truncate max-w-[280px] inline-block">{log.errorMessage ?? '—'}</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-400 text-[10px]">{Math.round(log.durationMs / 100) / 10}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
