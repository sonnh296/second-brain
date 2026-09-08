'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, MessageSquarePlus, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MarkdownContent } from '@/components/markdown-content'
import {
  ClassroomDocumentPreview,
  type ClassroomDocRow,
} from '@/components/classroom/classroom-document-preview'
import { dedupeCitedSourcesByFile } from '@/lib/ai/citations'
import type { CitedSource } from '@/lib/db/types'
import { cn } from '@/lib/utils'

type SessionRow = { id: string; title: string; created_at: string }

type Msg = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  cited_sources?: CitedSource[] | null
}

function stripCitationsBlock(text: string): string {
  return text.replace(/<!--CITATIONS:\[.*?\]-->\s*$/, '').trimEnd()
}

export default function ClassroomChatPage() {
  const { id } = useParams<{ id: string }>()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ClassroomDocRow | null>(null)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const bottomRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    const res = await fetch(`/api/classroom/${id}/sessions`)
    if (res.ok) {
      const data = await res.json()
      setSessions(data.sessions ?? [])
    }
    setLoadingSessions(false)
  }, [id])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    void fetch(`/api/classroom/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role === 'teacher' || data?.role === 'student') setRole(data.role)
      })
      .catch(() => {})
  }, [id])

  function openCitedSource(src: CitedSource) {
    if (!src.document_id) return
    setPreviewDoc({
      id: src.document_id,
      filename: src.filename,
      file_type: src.file_type || 'other',
      file_size_bytes: 0,
      status: 'done',
      created_at: new Date().toISOString(),
    })
  }

  async function openSession(sid: string) {
    if (streaming) return
    setSessionId(sid)
    setSidebarOpen(false)
    setLoadingMessages(true)
    setMessages([])
    const res = await fetch(`/api/classroom/${id}/sessions/${sid}`)
    if (res.ok) {
      const data = await res.json()
      setMessages(
        (data.messages ?? []).map(
          (m: {
            id: string
            role: 'user' | 'assistant'
            content: string
            cited_sources?: CitedSource[] | null
          }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            cited_sources: m.cited_sources ?? null,
          })
        )
      )
    }
    setLoadingMessages(false)
  }

  function startNewChat() {
    if (streaming) return
    setSessionId(null)
    setMessages([])
    setSidebarOpen(false)
    textareaRef.current?.focus()
  }

  async function deleteSession(sid: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (streaming) return
    const res = await fetch(`/api/classroom/${id}/sessions/${sid}`, { method: 'DELETE' })
    if (!res.ok) return
    setSessions((list) => list.filter((s) => s.id !== sid))
    if (sessionIdRef.current === sid) {
      setSessionId(null)
      setMessages([])
    }
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setMessages((m) => [
      ...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ])
    setStreaming(true)
    try {
      let sid = sessionIdRef.current
      if (!sid) {
        const resS = await fetch(`/api/classroom/${id}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: text.slice(0, 60) }),
        })
        if (!resS.ok) throw new Error('Không tạo được phiên chat')
        const s = await resS.json()
        sid = s.id as string
        sessionIdRef.current = sid
        setSessionId(sid)
        setSessions((list) => [
          { id: s.id, title: s.title, created_at: s.created_at },
          ...list.filter((x) => x.id !== s.id),
        ])
      }

      const res = await fetch(`/api/classroom/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, message: text }),
      })
      if (!res.ok || !res.body) {
        throw new Error((await res.json().catch(() => ({}))).error ?? 'Chat thất bại')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistant = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const chunk = JSON.parse(line.slice(2)) as string
              assistant += chunk
              setMessages((m) => {
                const copy = [...m]
                copy[copy.length - 1] = { role: 'assistant', content: assistant }
                return copy
              })
            } catch {
              /* ignore partial JSON */
            }
          }
        }
      }

      // Reload persisted message (citations stripped + cited_sources).
      // onFinish may still be inserting — retry briefly if the new turn isn't there yet.
      const mapMsgs = (data: {
        messages?: {
          id: string
          role: 'user' | 'assistant'
          content: string
          cited_sources?: CitedSource[] | null
        }[]
        session?: { title?: string }
      }) =>
        (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          cited_sources: m.cited_sources ?? null,
        }))

      let reloaded = false
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 200 * attempt))
        const detail = await fetch(`/api/classroom/${id}/sessions/${sid}`)
        if (!detail.ok) continue
        const data = await detail.json()
        const mapped = mapMsgs(data)
        const hasAssistant =
          mapped.length > 0 && mapped[mapped.length - 1]?.role === 'assistant'
        if (hasAssistant || attempt === 3) {
          setMessages(mapped)
          reloaded = true
          if (data.session?.title) {
            setSessions((list) =>
              list.map((s) =>
                s.id === sid ? { ...s, title: data.session.title as string } : s
              )
            )
          }
          break
        }
      }
      if (!reloaded) {
        setMessages((m) => {
          const copy = [...m]
          copy[copy.length - 1] = {
            role: 'assistant',
            content: stripCitationsBlock(assistant),
          }
          return copy
        })
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = {
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Lỗi chat',
        }
        return copy
      })
    } finally {
      setStreaming(false)
    }
  }, [id, input, streaming])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const sessionsPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 p-2 border-b">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={startNewChat}
          disabled={streaming}
        >
          <MessageSquarePlus className="h-4 w-4" />
          Chat mới
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loadingSessions ? (
          <p className="text-xs text-muted-foreground px-2 py-3">Đang tải...</p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-3">
            Chưa có đoạn chat. Chỉ bạn thấy các đoạn chat của mình.
          </p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                'group flex items-center gap-1 rounded-lg px-2 py-2 text-sm cursor-pointer',
                sessionId === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
              )}
              onClick={() => void openSession(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') void openSession(s.id)
              }}
              role="button"
              tabIndex={0}
            >
              <span className="flex-1 min-w-0 truncate">{s.title || 'Chat'}</span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background shrink-0"
                onClick={(e) => void deleteSession(s.id, e)}
                aria-label="Xóa đoạn chat"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="h-full flex min-h-0">
      <aside className="hidden sm:flex w-56 shrink-0 border-r flex-col bg-muted/10">
        {sessionsPanel}
      </aside>

      {sidebarOpen && (
        <>
          <button
            type="button"
            className="sm:hidden fixed inset-0 z-40 bg-black/30"
            aria-label="Đóng"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="sm:hidden fixed inset-y-0 left-0 z-50 w-64 border-r bg-background shadow-lg flex flex-col">
            {sessionsPanel}
          </aside>
        </>
      )}

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b sm:hidden">
          <Button type="button" variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
            Đoạn chat
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startNewChat}
            disabled={streaming}
          >
            Mới
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
          {loadingMessages ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : messages.length === 0 && !streaming ? (
            <div className="text-center py-16 space-y-2 max-w-md mx-auto">
              <p className="text-sm font-medium">Chat với tài liệu lớp</p>
              <p className="text-xs text-muted-foreground">
                Chỉ dùng tài liệu của lớp này. Đoạn chat của bạn là riêng tư — giáo viên và
                học sinh khác không xem được.
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const sources = dedupeCitedSourcesByFile(m.cited_sources ?? [])
              return (
                <div
                  key={m.id ?? i}
                  className={cn(
                    'rounded-xl px-3.5 py-2.5 text-sm max-w-3xl',
                    m.role === 'user'
                      ? 'bg-muted ml-auto'
                      : 'bg-background border mr-auto'
                  )}
                >
                  {m.role === 'assistant' ? (
                    <MarkdownContent
                      content={
                        stripCitationsBlock(m.content) ||
                        (streaming && i === messages.length - 1 ? '…' : '')
                      }
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                  {sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t">
                      {sources.map((src) => {
                        const clickable = Boolean(src.document_id)
                        return (
                          <Badge
                            key={`${src.document_id ?? src.filename}:${src.chunk_index}`}
                            variant="outline"
                            className={cn(
                              'text-xs gap-1 max-w-[180px]',
                              clickable && 'cursor-pointer hover:bg-muted'
                            )}
                            title={clickable ? `Mở ${src.filename}` : src.filename}
                            onClick={clickable ? () => openCitedSource(src) : undefined}
                            role={clickable ? 'button' : undefined}
                          >
                            <span className="truncate">{src.filename}</span>
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t p-3 bg-background">
          <form
            className="flex gap-2 max-w-3xl mx-auto items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={streaming}
              rows={1}
              placeholder="Hỏi về tài liệu trong lớp..."
              className="flex-1 min-h-10 max-h-40 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              disabled={streaming || !input.trim()}
              aria-label="Gửi"
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>

      <ClassroomDocumentPreview
        open={Boolean(previewDoc)}
        classroomId={id}
        doc={previewDoc}
        role={role}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  )
}
