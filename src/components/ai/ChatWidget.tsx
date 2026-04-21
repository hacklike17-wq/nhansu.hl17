'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Sparkles, X, Send, Loader2, AlertCircle, Wrench,
  History, Trash2, ArrowLeft, MessageSquare, Copy, Check,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/components/auth/AuthProvider'

type ToolCallTrace = {
  name: string
  args: Record<string, unknown>
  durationMs: number
}

type ChatMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  toolCalls?: ToolCallTrace[]
}

type ChatResponse = {
  conversationId: string
  role: string
  messages: ChatMsg[]
  usage?: { inputTokens: number; outputTokens: number }
}

type ConvSummary = {
  id: string
  title: string
  role: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

type ConvDetail = {
  conversation: { id: string; title: string | null; role: string }
  messages: ChatMsg[]
}

const ROLE_LABEL: Record<string, string> = {
  admin:    'Admin · 5 công cụ toàn công ty',
  manager:  'Quản lý · 5 công cụ cá nhân',
  employee: 'Nhân viên · 5 công cụ cá nhân',
}

const STORAGE_KEY = 'nhansu.ai.currentConversationId'

function readStoredConvId(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
function writeStoredConvId(id: string) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, id) } catch {}
}
function clearStoredConvId() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  return d.toISOString().slice(0, 10)
}

/**
 * Assistant bubble content: markdown-rendered with GFM (tables, strikethrough,
 * task lists, autolinks). Keep the renderer minimal — we don't need raw HTML.
 * Tailwind classes on each element tune the inline styles to fit the 13px
 * bubble width without overriding global prose styles.
 */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="ai-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc ml-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children, className }) => {
            const isBlock = (className ?? '').startsWith('language-')
            if (isBlock) {
              return (
                <pre className="my-2 p-2 bg-gray-900 text-gray-100 rounded text-[11px] overflow-x-auto">
                  <code>{children}</code>
                </pre>
              )
            }
            return <code className="px-1 py-0.5 rounded bg-gray-100 text-[12px] font-mono">{children}</code>
          },
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-violet-700 underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="text-[11px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
          h1: ({ children }) => <h1 className="text-sm font-bold mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[13px] font-bold mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gray-300 pl-2 text-gray-600 italic my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

/** Small copy-to-clipboard button used by assistant bubbles. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard might be blocked (http / permissions) — silently ignore
    }
  }
  return (
    <button
      onClick={onClick}
      className="text-gray-300 hover:text-gray-600 p-1 rounded transition opacity-0 group-hover:opacity-100"
      title={copied ? 'Đã copy' : 'Copy'}
      aria-label="Copy"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
    </button>
  )
}

/**
 * Floating chat widget with conversation history.
 *
 * Bottom-right bubble; click to open a 460x600 panel. Open to any
 * authenticated user. Scoping is enforced server-side:
 *  - admin    → company-wide tools (5)
 *  - manager  → self-scope tools (5)
 *  - employee → self-scope tools (5, identical to manager)
 *
 * Conversation persistence (Phase 2.4):
 *  - Current conversationId is stored in localStorage so F5 / navigate
 *    keeps the thread open.
 *  - A history panel lists previous conversations; clicking one loads
 *    its messages. Each row has a trash button for hard delete (the
 *    DB cascades to ai_messages).
 *  - Server rejects 404 for non-owned ids; we silently clear
 *    localStorage in that case.
 */
export default function ChatWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // History panel state
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<ConvSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [loadingConvId, setLoadingConvId] = useState<string | null>(null)
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea: grow with content up to ~5 lines, then scroll.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, 120) // ≈ 5 lines at 13px
    el.style.height = `${next}px`
  }, [input])

  const canUseAI = !!user

  // Auto-scroll chat area on new messages (but not while history is shown)
  useEffect(() => {
    if (!open || showHistory) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open, showHistory])

  // On mount, try to restore last conversation from localStorage. Silently
  // clear if the id no longer belongs to the user (404) or the call fails.
  useEffect(() => {
    if (!canUseAI) return
    const saved = readStoredConvId()
    if (!saved) return
    setRestoring(true)
    fetch(`/api/ai/chat/conversations/${saved}`)
      .then(async r => {
        if (r.status === 404) {
          clearStoredConvId()
          return null
        }
        if (!r.ok) throw new Error('fetch failed')
        return (await r.json()) as ConvDetail
      })
      .then(data => {
        if (!data) return
        setConversationId(data.conversation.id)
        setMessages(data.messages)
      })
      .catch(() => {
        // Non-fatal — UI starts fresh
      })
      .finally(() => setRestoring(false))
  }, [canUseAI])

  if (!canUseAI) return null

  const roleLabel = ROLE_LABEL[user?.role ?? ''] ?? 'Trợ lý cá nhân'
  const isAdminUser = user?.role === 'admin'

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    setError(null)
    setSending(true)

    const optimisticId = `tmp-${Date.now()}`
    setMessages(prev => [...prev, { id: optimisticId, role: 'user', content: text }])
    setInput('')

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          message: text,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Lỗi không xác định')
      }
      const typed = data as ChatResponse
      setConversationId(typed.conversationId)
      writeStoredConvId(typed.conversationId)

      setMessages(prev => {
        const withoutOpt = prev.filter(m => m.id !== optimisticId)
        return [...withoutOpt, ...typed.messages]
      })
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setInput(text)
      setError(e?.message ?? 'Không gửi được')
    } finally {
      setSending(false)
    }
  }

  const resetConversation = () => {
    setMessages([])
    setConversationId(null)
    setError(null)
    clearStoredConvId()
  }

  const openHistory = async () => {
    setShowHistory(true)
    setHistoryError(null)
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/ai/chat/conversations')
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setHistory(data.conversations ?? [])
    } catch {
      setHistoryError('Không tải được lịch sử hội thoại')
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadConversation = async (id: string) => {
    if (loadingConvId) return
    setLoadingConvId(id)
    setError(null)
    try {
      const res = await fetch(`/api/ai/chat/conversations/${id}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = (await res.json()) as ConvDetail
      setConversationId(data.conversation.id)
      setMessages(data.messages)
      writeStoredConvId(data.conversation.id)
      setShowHistory(false)
    } catch {
      setError('Không tải được hội thoại đã chọn')
    } finally {
      setLoadingConvId(null)
    }
  }

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingConvId) return
    if (!confirm('Xoá hội thoại này? Không thể khôi phục.')) return
    setDeletingConvId(id)
    try {
      const res = await fetch(`/api/ai/chat/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setHistory(prev => prev.filter(c => c.id !== id))
      if (conversationId === id) {
        setConversationId(null)
        setMessages([])
        clearStoredConvId()
      }
    } catch {
      setHistoryError('Không xoá được hội thoại')
    } finally {
      setDeletingConvId(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 md:bottom-10 md:right-8 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center"
          aria-label="Mở trợ lý AI"
          title="Trợ lý AI"
        >
          <Sparkles size={22} />
        </button>
      )}

      {/* Mobile backdrop — tap ra ngoài để đóng */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/30"
          aria-hidden="true"
        />
      )}

      {/* Chat panel — mobile: anchor top + dvh để iOS keyboard co height đúng, không đẩy panel trôi. Giữ viền bo tròn với 8px margin quanh. */}
      {open && (
        <div className="fixed inset-x-2 top-2 h-[calc(100dvh-1rem)] md:inset-auto md:top-auto md:bottom-10 md:right-8 md:h-[600px] md:w-[460px] z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white">
            <div className="flex items-center gap-2 min-w-0">
              {showHistory ? (
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded hover:bg-white/20 transition"
                  aria-label="Quay lại"
                >
                  <ArrowLeft size={16} />
                </button>
              ) : (
                <Sparkles size={16} className="shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight truncate">
                  {showHistory ? 'Lịch sử hội thoại' : 'Trợ lý AI'}
                </div>
                <div className="text-[10px] opacity-80 truncate">
                  {showHistory ? `${history.length} hội thoại` : roleLabel}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!showHistory && (
                <>
                  <button
                    onClick={openHistory}
                    className="p-1.5 rounded hover:bg-white/20 transition"
                    title="Lịch sử hội thoại"
                    aria-label="Lịch sử"
                  >
                    <History size={14} />
                  </button>
                  {(messages.length > 0 || conversationId) && (
                    <button
                      onClick={resetConversation}
                      className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition"
                      title="Bắt đầu hội thoại mới"
                    >
                      Mới
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/20 transition"
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* History overlay */}
          {showHistory && (
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {historyLoading && (
                <div className="p-10 text-center text-xs text-gray-400">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                  Đang tải...
                </div>
              )}
              {historyError && (
                <div className="p-4 text-xs text-red-600 text-center">{historyError}</div>
              )}
              {!historyLoading && !historyError && history.length === 0 && (
                <div className="p-10 text-center text-xs text-gray-400">
                  <MessageSquare size={24} className="mx-auto mb-2 text-gray-300" />
                  <p>Chưa có hội thoại nào.</p>
                </div>
              )}
              {!historyLoading && history.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {history.map(c => {
                    const isCurrent = c.id === conversationId
                    const isLoading = loadingConvId === c.id
                    const isDeleting = deletingConvId === c.id
                    return (
                      <div
                        key={c.id}
                        onClick={() => loadConversation(c.id)}
                        className={`group px-4 py-3 cursor-pointer transition ${
                          isCurrent ? 'bg-violet-50' : 'hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {isCurrent && (
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                              )}
                              <div className="text-xs font-semibold text-gray-800 truncate">
                                {c.title || 'Hội thoại'}
                              </div>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                              {c.messageCount} tin nhắn · {formatRelativeTime(c.updatedAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
                            <button
                              onClick={(e) => deleteConversation(c.id, e)}
                              disabled={isDeleting}
                              className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition disabled:opacity-40"
                              title="Xoá"
                              aria-label="Xoá hội thoại"
                            >
                              {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Messages area */}
          {!showHistory && (
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50"
            >
              {restoring && messages.length === 0 && (
                <div className="text-center text-[11px] text-gray-400 pt-6">
                  <Loader2 size={14} className="animate-spin inline mr-1" />
                  Đang khôi phục hội thoại...
                </div>
              )}

              {!restoring && messages.length === 0 && (
                <div className="text-center text-xs text-gray-400 pt-10 px-4">
                  <Sparkles size={24} className="mx-auto mb-2 text-violet-300" />
                  <p className="font-semibold text-gray-500 mb-1">Bắt đầu hội thoại</p>
                  {isAdminUser ? (
                    <>
                      <p>Hỏi về quy tắc, nội quy, hoặc số liệu công ty.</p>
                      <p className="mt-2 text-[10px] text-gray-400">
                        Admin có 5 công cụ: tổng quan, danh sách NV, phiếu lương, chấm công, vi phạm KPI.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Hỏi về lương, công, KPI của bạn — hoặc quy tắc công ty.</p>
                      <p className="mt-2 text-[10px] text-gray-400">
                        Có 5 công cụ cá nhân: thông tin, phiếu lương, chấm công, vi phạm KPI, lịch sử nghỉ phép.
                      </p>
                    </>
                  )}
                </div>
              )}

              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex flex-col group ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="max-w-[95%] mb-1 text-[10px] text-gray-500 flex flex-wrap gap-1">
                      {m.toolCalls.map((tc, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700"
                          title={`${tc.durationMs}ms · ${JSON.stringify(tc.args)}`}
                        >
                          <Wrench size={9} />
                          {tc.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] bg-blue-600 text-white rounded-br-sm px-3.5 py-2.5 rounded-2xl text-[13px] whitespace-pre-wrap leading-relaxed">
                      {m.content}
                    </div>
                  ) : (
                    <div className="flex items-start gap-1 max-w-[95%]">
                      <div className="bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] leading-relaxed flex-1 min-w-0">
                        <AssistantMarkdown content={m.content} />
                      </div>
                      <CopyButton text={m.content} />
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-white border border-gray-200 text-gray-400 text-xs flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    AI đang suy nghĩ...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error bar (only in chat view) */}
          {!showHistory && error && (
            <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-[11px] text-red-700 flex items-start gap-2">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
            </div>
          )}

          {/* Input (only in chat view) */}
          {!showHistory && (
            <div className="border-t border-gray-200 px-3 py-3 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Nhập câu hỏi... (Enter gửi, Shift+Enter xuống dòng)"
                  rows={1}
                  disabled={sending}
                  className="flex-1 resize-none text-base md:text-[13px] leading-relaxed border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 disabled:opacity-50 overflow-y-auto"
                />
                <button
                  onClick={send}
                  disabled={sending || input.trim().length === 0}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  aria-label="Gửi"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
