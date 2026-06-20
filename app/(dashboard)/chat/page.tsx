'use client'

import { useState, useEffect, useRef } from 'react'
import { useChat } from 'ai/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MarkdownContent } from '@/components/markdown-content'
import { TypingIndicator } from '@/components/typing-indicator'
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, type ChatModelId } from '@/lib/ai/models'
import type { ChatSession, CitedSource } from '@/lib/db/types'

const MODEL_STORAGE_KEY = 'second-brain-chat-model'
const CHAT_MODE_STORAGE_KEY = 'second-brain-chat-mode'

type ChatMode = 'knowledge' | 'general'

type SessionMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  cited_sources?: CitedSource[]
}

function mapSessionMessages(
  messages: { id: string; role: string; content: string; cited_sources?: CitedSource[] }[]
): SessionMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    cited_sources: m.cited_sources,
  }))
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL)
  const [chatMode, setChatMode] = useState<ChatMode>('knowledge')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [noContextNotice, setNoContextNotice] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const activeSessionRef = useRef<ChatSession | null>(null)

  useEffect(() => {
    activeSessionRef.current = activeSession
  }, [activeSession])

  useEffect(() => {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY)
    if (saved && CHAT_MODELS.some((m) => m.id === saved)) {
      setSelectedModel(saved as ChatModelId)
    }
    const savedMode = localStorage.getItem(CHAT_MODE_STORAGE_KEY)
    if (savedMode === 'knowledge' || savedMode === 'general') {
      setChatMode(savedMode)
    }
  }, [])

  const { messages, input, handleInputChange, handleSubmit, isLoading, status, setMessages, data: streamData } = useChat({
    api: '/api/chat',
    id: activeSession?.id,
    body: { session_id: activeSession?.id, model: selectedModel, mode: chatMode },
    onError: (err) => console.error('[chat] Error:', err),
    onFinish: async () => {
      const session = activeSessionRef.current
      if (!session) return
      const res = await fetch(`/api/sessions/${session.id}`)
      if (res.ok) {
        const data = await res.json()
        const title = data.session.title as string
        setActiveSession((prev) => (prev ? { ...prev, title } : prev))
        setSessions((prev) =>
          prev.map((s) => (s.id === session.id ? { ...s, title } : s))
        )
        if (data.messages?.length) {
          setMessages(mapSessionMessages(data.messages))
        }
      }
    },
  })

  useEffect(() => {
    if (!streamData?.length) return
    for (const part of streamData) {
      const item = part as { no_context?: boolean; message?: string }
      if (item.no_context && item.message) {
        setNoContextNotice(item.message)
      }
    }
  }, [streamData])

  useEffect(() => {
    fetchSessions()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  async function fetchSessions() {
    setLoadingSessions(true)
    const res = await fetch('/api/sessions')
    if (res.ok) {
      const data = await res.json()
      setSessions(data)
    }
    setLoadingSessions(false)
  }

  async function loadSession(session: ChatSession) {
    setActiveSession(session)
    const res = await fetch(`/api/sessions/${session.id}`)
    if (res.ok) {
      const data = await res.json()
      setMessages(mapSessionMessages(data.messages ?? []))
    } else {
      setMessages([])
    }
  }

  async function createSession() {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const session = await res.json()
      setSessions((prev) => [session, ...prev])
      setActiveSession(session)
      setMessages([])
    }
  }

  async function renameSession(sessionId: string, title: string) {
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s)))
      if (activeSession?.id === sessionId) {
        setActiveSession((prev) => (prev ? { ...prev, title: updated.title } : prev))
      }
    }
    setRenamingId(null)
  }

  async function deleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this chat session?')) return
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (activeSession?.id === sessionId) {
      setActiveSession(null)
      setMessages([])
    }
  }

  function onModelChange(value: string) {
    const model = value as ChatModelId
    setSelectedModel(model)
    localStorage.setItem(MODEL_STORAGE_KEY, model)
  }

  function onModeChange(value: ChatMode) {
    setChatMode(value)
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, value)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!activeSession) return
    setNoContextNotice(null)
    handleSubmit(e, {
      body: { session_id: activeSession.id, model: selectedModel, mode: chatMode },
    })
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim() && activeSession) {
        const form = e.currentTarget.form
        if (form) form.requestSubmit()
      }
    }
  }

  function startRename(session: ChatSession, e: React.MouseEvent) {
    e.stopPropagation()
    setRenamingId(session.id)
    setRenameValue(session.title)
  }

  return (
    <div className="flex h-full max-w-6xl mx-auto">
      {/* Sidebar — fixed */}
      <aside className="w-60 shrink-0 flex flex-col border-r bg-muted/20">
        <div className="shrink-0 p-3">
          <Button size="sm" className="w-full" onClick={createSession}>
            + Cuộc trò chuyện mới
          </Button>
        </div>
        <Separator />
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          <div className="space-y-1">
            {loadingSessions ? (
              <p className="text-xs text-muted-foreground px-2">Đang tải...</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2">Chưa có cuộc trò chuyện</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer text-sm ${
                    activeSession?.id === s.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => renamingId !== s.id && loadSession(s)}
                >
                  {renamingId === s.id ? (
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-6 text-xs"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameSession(s.id, renameValue.trim() || s.title)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => renameSession(s.id, renameValue.trim() || s.title)}
                    />
                  ) : (
                    <>
                      <span className="truncate flex-1 text-xs">{s.title}</span>
                      <button
                        className="hidden group-hover:block text-muted-foreground hover:text-foreground text-xs px-1"
                        onClick={(e) => startRename(s, e)}
                        title="Đổi tên"
                      >
                        ✎
                      </button>
                      <button
                        className="hidden group-hover:block text-muted-foreground hover:text-destructive text-xs"
                        onClick={(e) => deleteSession(s.id, e)}
                      >
                        ✕
                      </button>
                      <a
                        href={`/api/sessions/${s.id}/export`}
                        className="hidden group-hover:block text-muted-foreground hover:text-foreground text-xs px-1"
                        title="Xuất chat"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↓
                      </a>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main chat — toolbar + scrollable messages + fixed input */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {!activeSession ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
            <p className="text-sm">Bắt đầu cuộc trò chuyện mới</p>
            <Button size="sm" onClick={createSession}>
              + Cuộc trò chuyện mới
            </Button>
          </div>
        ) : (
          <>
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b bg-background">
              <h2 className="font-medium text-sm truncate">{activeSession.title}</h2>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <div className="flex rounded-md border border-input overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => onModeChange('knowledge')}
                    className={`px-2.5 py-1.5 transition-colors ${
                      chatMode === 'knowledge'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Kho tài liệu
                  </button>
                  <button
                    type="button"
                    onClick={() => onModeChange('general')}
                    className={`px-2.5 py-1.5 transition-colors ${
                      chatMode === 'general'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Chat tự do
                  </button>
                </div>
                <label htmlFor="model-select" className="text-xs text-muted-foreground">
                  Model
                </label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="text-xs rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CHAT_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {noContextNotice && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
                    {noContextNotice}
                  </div>
                )}
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center pt-8">
                    Hỏi bất cứ điều gì về tài liệu đã upload.
                  </p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {m.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      ) : (
                        <MarkdownContent content={m.content} />
                      )}
                      {m.role === 'assistant' && (m as { cited_sources?: CitedSource[] }).cited_sources?.length ? (
                        <div className="mt-2 pt-2 border-t border-border/40">
                          <p className="text-xs text-muted-foreground mb-1">Nguồn liên quan:</p>
                          <div className="flex flex-wrap gap-1">
                            {((m as unknown as { cited_sources: CitedSource[] }).cited_sources).map((src, i) => (
                              <Badge key={`${src.filename}-${src.chunk_index}-${i}`} variant="outline" className="text-xs">
                                {src.filename}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {status === 'submitted' && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="shrink-0 border-t bg-background px-4 py-3">
              <form onSubmit={onSubmit} className="flex gap-3 items-end max-w-3xl mx-auto">
                <Textarea
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={onInputKeyDown}
                  placeholder={
                    chatMode === 'knowledge'
                      ? 'Đặt câu hỏi về tài liệu của bạn... (Enter gửi, Shift+Enter xuống dòng)'
                      : 'Chat tự do — không dùng kho tài liệu... (Enter gửi, Shift+Enter xuống dòng)'
                  }
                  disabled={isLoading}
                  rows={3}
                  className="flex-1 min-h-[88px] text-base leading-relaxed resize-none"
                />
                <Button type="submit" disabled={isLoading || !input.trim()} className="h-11 px-5 shrink-0">
                  {isLoading ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:300ms]" />
                    </span>
                  ) : (
                    'Gửi'
                  )}
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
