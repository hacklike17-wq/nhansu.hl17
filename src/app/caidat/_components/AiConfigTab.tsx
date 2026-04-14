'use client'
import { useEffect, useState } from 'react'
import { KeyRound, Save, Sparkles, Trash2, Loader2 } from 'lucide-react'
import { OPENAI_MODELS } from '@/lib/ai/providers/models'
import { AI_PROVIDERS } from '@/lib/schemas/ai'

type AiConfigResponse = {
  provider: string
  model: string
  apiKeyLast4: string | null
  hasApiKey: boolean
  systemPromptAdmin: string
  systemPromptManager: string
  systemPromptEmployee: string
  companyRules: string
  enabled: boolean
  monthlyTokenLimit: number
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type TestStatus = 'idle' | 'running' | 'ok' | 'error'

const PROVIDER_LABELS: Record<string, string> = {
  openai:    'OpenAI',
  anthropic: 'Anthropic (chưa hỗ trợ Phase 1)',
  google:    'Google Gemini (chưa hỗ trợ Phase 1)',
}

const DEFAULT_ADMIN_PROMPT = `Bạn là trợ lý AI cho quản trị viên hệ thống nhân sự.
Trả lời bằng tiếng Việt, CHUYÊN NGHIỆP, NGẮN GỌN, có số liệu cụ thể.

PHẠM VI DỮ LIỆU: toàn công ty.
Khi cần số liệu → gọi các tool get_company_*, list_*, get_employee_*.
Luôn trích dẫn nguồn (tháng, phòng ban, nhân viên).
Nếu không chắc → nói "tôi không có thông tin", KHÔNG đoán.`

const DEFAULT_MANAGER_PROMPT = `Bạn là trợ lý AI cho quản lý trung cấp.
Trả lời bằng tiếng Việt, chuyên nghiệp, ngắn gọn.

PHẠM VI DỮ LIỆU: CHỈ của người đang hỏi (không xem được dữ liệu người khác).
Khi hỏi về lương/công/KPI của bản thân → gọi tool get_my_*.
Khi hỏi về quy trình, deadline, quy tắc → dựa vào NỘI QUY CÔNG TY bên dưới.
TUYỆT ĐỐI KHÔNG tiết lộ dữ liệu của nhân viên khác.`

const DEFAULT_EMPLOYEE_PROMPT = `Bạn là trợ lý AI cho nhân viên công ty.
Trả lời bằng tiếng Việt, THÂN THIỆN, dễ hiểu, kiên nhẫn giải thích.

PHẠM VI DỮ LIỆU: CHỈ của người đang hỏi.
Khi nhân viên hỏi về lương, công, KPI → gọi tool get_my_* → lấy số liệu thật → GIẢI THÍCH rõ con số đó đến từ đâu, theo quy tắc nào trong nội quy.
Nếu bị trừ lương/công, PHẢI giải thích lý do dựa vào NỘI QUY CÔNG TY bên dưới.
TUYỆT ĐỐI KHÔNG tiết lộ dữ liệu của nhân viên khác.`

export default function AiConfigTab() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<AiConfigResponse | null>(null)

  // Form state
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [systemPromptAdmin, setSystemPromptAdmin] = useState('')
  const [systemPromptManager, setSystemPromptManager] = useState('')
  const [systemPromptEmployee, setSystemPromptEmployee] = useState('')
  const [companyRules, setCompanyRules] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [monthlyTokenLimit, setMonthlyTokenLimit] = useState(1000000)

  // Save / test state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('Đi muộn 2 phút trừ bao nhiêu tiền chuyên cần?')
  const [testRole, setTestRole] = useState<'admin' | 'manager' | 'employee'>('admin')
  const [testResponse, setTestResponse] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testUsage, setTestUsage] = useState<{ inputTokens: number; outputTokens: number; systemPromptChars?: number } | null>(null)

  // Load existing config
  useEffect(() => {
    let cancelled = false
    fetch('/api/ai/config')
      .then(r => {
        if (!r.ok) throw new Error('Không tải được cấu hình')
        return r.json() as Promise<AiConfigResponse>
      })
      .then(data => {
        if (cancelled) return
        setConfig(data)
        setProvider(data.provider || 'openai')
        setModel(data.model || 'gpt-4o-mini')
        setSystemPromptAdmin(data.systemPromptAdmin || DEFAULT_ADMIN_PROMPT)
        setSystemPromptManager(data.systemPromptManager || DEFAULT_MANAGER_PROMPT)
        setSystemPromptEmployee(data.systemPromptEmployee || DEFAULT_EMPLOYEE_PROMPT)
        setCompanyRules(data.companyRules || '')
        setEnabled(data.enabled)
        setMonthlyTokenLimit(data.monthlyTokenLimit || 1000000)
      })
      .catch(e => {
        setSaveError(e?.message ?? 'Lỗi tải cấu hình')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const body: Record<string, unknown> = {
        provider,
        model,
        systemPromptAdmin,
        systemPromptManager,
        systemPromptEmployee,
        companyRules,
        enabled,
        monthlyTokenLimit,
      }
      if (clearKey) {
        body.clearKey = true
      } else if (apiKeyInput.trim().length > 0) {
        body.apiKey = apiKeyInput.trim()
      }

      const res = await fetch('/api/ai/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err?.error === 'string' ? err.error : 'Không lưu được cấu hình')
      }
      const data: AiConfigResponse = await res.json()
      setConfig(data)
      setApiKeyInput('')
      setClearKey(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (e: any) {
      setSaveError(e?.message ?? 'Lỗi không xác định')
      setSaveStatus('error')
    }
  }

  const runTest = async () => {
    setTestStatus('running')
    setTestError(null)
    setTestResponse(null)
    setTestUsage(null)
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage, role: testRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Test thất bại')
      }
      setTestResponse(data.response ?? '(không có nội dung)')
      setTestUsage(data.usage ?? null)
      setTestStatus('ok')
    } catch (e: any) {
      setTestError(e?.message ?? 'Lỗi không xác định')
      setTestStatus('error')
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-xs text-gray-400">
        Đang tải cấu hình...
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Provider / Model */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-violet-600" />
          <div className="text-sm font-bold text-gray-900">Nhà cung cấp & mô hình</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Provider</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {AI_PROVIDERS.map(p => (
                <option key={p} value={p} disabled={p !== 'openai'}>
                  {PROVIDER_LABELS[p] ?? p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {OPENAI_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-[11px] font-medium text-gray-600 mb-1 flex items-center gap-1.5">
            <KeyRound size={11} /> API Key
          </label>
          {config?.hasApiKey && !clearKey && (
            <div className="mb-2 text-[11px] text-gray-500">
              Key hiện tại: <span className="font-mono text-gray-700">···{config.apiKeyLast4 ?? '????'}</span>
              <button
                type="button"
                onClick={() => { setClearKey(true); setApiKeyInput('') }}
                className="ml-3 text-red-600 hover:underline inline-flex items-center gap-1"
              >
                <Trash2 size={11} /> Xoá
              </button>
            </div>
          )}
          {clearKey && (
            <div className="mb-2 text-[11px] text-red-600">
              Key sẽ bị xoá khi nhấn Lưu.
              <button type="button" onClick={() => setClearKey(false)} className="ml-3 text-gray-500 hover:underline">Huỷ</button>
            </div>
          )}
          <input
            type="password"
            value={apiKeyInput}
            onChange={e => { setApiKeyInput(e.target.value); setClearKey(false) }}
            placeholder={config?.hasApiKey ? 'Nhập key mới để thay thế (để trống = giữ nguyên)' : 'sk-...'}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            autoComplete="off"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Key được mã hoá AES-256-GCM trước khi lưu. Máy chủ không bao giờ trả lại plaintext cho trình duyệt.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="rounded"
            />
            <span>Bật trợ lý AI cho công ty</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <span>Hạn mức tokens / tháng:</span>
            <input
              type="number"
              min={0}
              step={100000}
              value={monthlyTokenLimit}
              onChange={e => setMonthlyTokenLimit(Math.max(0, Number(e.target.value) || 0))}
              className="w-32 text-xs border border-gray-200 rounded-lg px-2 py-1 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </label>
        </div>
      </div>

      {/* Prompts */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-bold text-gray-900 mb-1">System prompt theo vai trò</div>
        <p className="text-[11px] text-gray-400 mb-4">
          Admin = xem toàn công ty. Manager + Nhân viên = chỉ xem dữ liệu bản thân, khác nhau ở tone trả lời.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">
              Prompt cho <span className="text-violet-700 font-semibold">Admin</span> — scope: toàn công ty
            </label>
            <textarea
              value={systemPromptAdmin}
              onChange={e => setSystemPromptAdmin(e.target.value)}
              rows={6}
              placeholder={DEFAULT_ADMIN_PROMPT}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">
              Prompt cho <span className="text-blue-700 font-semibold">Quản lý</span> — scope: bản thân
            </label>
            <textarea
              value={systemPromptManager}
              onChange={e => setSystemPromptManager(e.target.value)}
              rows={6}
              placeholder={DEFAULT_MANAGER_PROMPT}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">
              Prompt cho <span className="text-green-700 font-semibold">Nhân viên</span> — scope: bản thân
            </label>
            <textarea
              value={systemPromptEmployee}
              onChange={e => setSystemPromptEmployee(e.target.value)}
              rows={6}
              placeholder={DEFAULT_EMPLOYEE_PROMPT}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">
              Nội quy công ty & quy tắc KPI (gắn vào prompt của cả 3 role)
            </label>
            <textarea
              value={companyRules}
              onChange={e => setCompanyRules(e.target.value)}
              rows={8}
              placeholder={'Ví dụ:\n- Đi muộn 1 lần = trừ 50.000đ\n- Vắng không phép = trừ 1 công\n- KPI hiệu suất ≥ 90% = thưởng 500.000đ/tháng'}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saveStatus === 'saving'}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saveStatus === 'saving' ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
        {saveStatus === 'saved' && <span className="text-[11px] text-green-600">✓ Đã lưu</span>}
        {saveStatus === 'error' && saveError && <span className="text-[11px] text-red-600">{saveError}</span>}
      </div>

      {/* Test panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-bold text-gray-900 mb-1">Thử nghiệm kết nối</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Dùng prompt + nội quy đã lưu để test. Chưa kết nối DB — chỉ trả lời dựa trên văn bản nội quy.
          Lưu cấu hình TRƯỚC khi test nếu vừa sửa prompt hoặc nội quy.
        </p>

        <div className="flex items-start gap-2">
          <select
            value={testRole}
            onChange={e => setTestRole(e.target.value as 'admin' | 'manager' | 'employee')}
            className="text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shrink-0"
          >
            <option value="admin">Admin</option>
            <option value="manager">Quản lý</option>
            <option value="employee">Nhân viên</option>
          </select>
          <input
            type="text"
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            placeholder="Nhập câu hỏi ngắn để test..."
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <button
            onClick={runTest}
            disabled={testStatus === 'running' || !config?.hasApiKey}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0"
          >
            {testStatus === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {testStatus === 'running' ? 'Đang gọi...' : 'Thử nghiệm'}
          </button>
        </div>

        {!config?.hasApiKey && (
          <p className="text-[11px] text-amber-600 mt-2">
            ⚠ Lưu API key trước khi thử nghiệm.
          </p>
        )}

        {testResponse && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">
              Phản hồi từ AI (role: {testRole})
            </div>
            <div className="text-xs text-gray-800 whitespace-pre-wrap">{testResponse}</div>
            {testUsage && (
              <div className="mt-2 text-[10px] text-gray-500 tabular-nums">
                Tokens: {testUsage.inputTokens} in · {testUsage.outputTokens} out
                {typeof testUsage.systemPromptChars === 'number' && (
                  <> · system prompt {testUsage.systemPromptChars} ký tự</>
                )}
              </div>
            )}
          </div>
        )}

        {testError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {testError}
          </div>
        )}
      </div>
    </div>
  )
}
