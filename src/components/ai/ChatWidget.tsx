'use client'
import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'

type ChatMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

type ChatResponse = {
  conversationId: string
  role: string
  messages: ChatMsg[]
  usage?: { inputTokens: number; outputTokens: number }
}

/**
 * Phase 2.1 floating chat widget. Bottom-right bubble; click to open a
 * 460x600 panel. Admin only for now — manager/employee will be opened in
 * Phase 2.3 once their tool scope is implemented.
 *
 * Stateless on reload: the widget forgets the conversation when the page
 * is navigated because we don't persist conversationId locally. That's OK
 * for Phase 2.1 — conversation history browsing is a Phase 2.4 feature.
 */
export default function ChatWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Phase 2.1 gate: admin only
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  if (!isAdmin) return null

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    setError(null)
    setSending(true)

    // Optimistically add the user message
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

      // Replace the optimistic user message with the server-confirmed pair
      setMessages(prev => {
        const withoutOpt = prev.filter(m => m.id !== optimisticId)
        return [...withoutOpt, ...typed.messages]
      })
    } catch (e: any) {
      // Remove optimistic message on failure so the user can retry without duplicate
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
          className="fixed bottom-10 right-8 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center"
          aria-label="Mở trợ lý AI"
          title="Trợ lý AI"
        >
          <Sparkles size={22} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-10 right-8 z-50 w-[460px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-3rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white">
            <div className="flex items-center gap-2">
              <Sparkles size={16} />
              <div>
                <div className="text-sm font-bold leading-tight">Trợ lý AI</div>
                <div className="text-[10px] opacity-80">Admin · Phase 2.1 (chưa có tool)</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={resetConversation}
                  className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition"
                  title="Bắt đầu hội thoại mới"
                >
                  Mới
                </button>
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

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50"
          >
            {messages.length === 0 && (
              <div className="text-center text-xs text-gray-400 pt-10 px-4">
                <Sparkles size={24} className="mx-auto mb-2 text-violet-300" />
                <p className="font-semibold text-gray-500 mb-1">Bắt đầu hội thoại</p>
                <p>Hỏi về quy tắc KPI, nội quy, quy trình...</p>
                <p className="mt-2 text-[10px] text-gray-400">
                  Phase 2.1 chưa đọc được DB — câu hỏi số liệu cá nhân sẽ trả về "chưa hỗ trợ".
                </p>
              </div>
            )}

            {messages.map(m => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`${
                    m.role === 'user'
                      ? 'max-w-[85%] bg-blue-600 text-white rounded-br-sm'
                      : 'max-w-[95%] bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                  } px-3.5 py-2.5 rounded-2xl text-[13px] whitespace-pre-wrap leading-relaxed`}
                >
                  {m.content}
                </div>
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

          {/* Error bar */}
          {error && (
            <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-[11px] text-red-700 flex items-start gap-2">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-200 px-3 py-3 bg-white">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
                rows={1}
                disabled={sending}
                className="flex-1 resize-none text-xs border border-gray-200 rounded-lg px-3 py-2 max-h-24 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 disabled:opacity-50"
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
        </div>
      )}
    </>
  )
}
