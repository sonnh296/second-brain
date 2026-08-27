'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

type Msg = { role: 'user' | 'assistant'; content: string }

function ClassroomChatInner() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q')?.trim() ?? ''
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState(initialQ)
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoSent = useRef(false)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim()
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
            body: JSON.stringify({ title: 'Chat lớp học' }),
          })
          if (!resS.ok) throw new Error('Could not create session')
          const s = await resS.json()
          sid = s.id as string
          sessionIdRef.current = sid
          setSessionId(sid)
        }

        const res = await fetch(`/api/classroom/${id}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid, message: text }),
        })
        if (!res.ok || !res.body) {
          throw new Error((await res.json().catch(() => ({}))).error ?? 'Chat failed')
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
                /* ignore */
              }
            }
          }
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
    },
    [id, input, streaming]
  )

  useEffect(() => {
    if (initialQ && !autoSent.current) {
      autoSent.current = true
      void send(initialQ)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 px-3 sm:px-5 py-3 border-b">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="relative max-w-2xl"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            className="w-full h-11 rounded-lg border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Search AI — hỏi tài liệu trong lớp..."
            value={input}
            disabled={streaming}
            onChange={(e) => setInput(e.target.value)}
          />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-2 max-w-3xl">
        {messages.length === 0 && !streaming && (
          <p className="text-sm text-muted-foreground text-center py-16">
            Gõ câu hỏi rồi Enter
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-muted ml-8' : 'bg-background border mr-8'
            }`}
          >
            {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

export default function ClassroomChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Đang tải...</div>}>
      <ClassroomChatInner />
    </Suspense>
  )
}
