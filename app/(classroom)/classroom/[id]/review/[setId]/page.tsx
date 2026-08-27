'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Item = {
  id: string
  item_type: 'flashcard' | 'mcq' | 'written'
  prompt: string
  payload: Record<string, unknown>
}

export default function ReviewSetPage() {
  const { id, setId } = useParams<{ id: string; setId: string }>()
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('draft')
  const [items, setItems] = useState<Item[]>([])
  const [attempts, setAttempts] = useState<
    { id: string; score: number | null; max_score: number | null; tab_blur_count: number; status: string }[]
  >([])
  const [mode, setMode] = useState<'view' | 'edit' | 'take'>('view')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [flip, setFlip] = useState<Record<string, boolean>>({})
  const [blurCount, setBlurCount] = useState(0)
  const [result, setResult] = useState<{ score: number; max_score: number; tab_blur_count: number } | null>(
    null
  )
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/classroom/${id}/review/${setId}`)
    if (!res.ok) return
    const data = await res.json()
    setRole(data.role)
    setTitle(data.set.title)
    setStatus(data.set.status)
    setItems(data.items ?? [])
    setAttempts(data.attempts ?? [])
  }, [id, setId])

  useEffect(() => {
    void load()
  }, [load])

  // Tab switch detection while taking review (visibilitychange only — avoids double-count with window blur)
  useEffect(() => {
    if (mode !== 'take' || !attemptId) return

    const onVis = () => {
      if (document.visibilityState !== 'hidden') return
      setBlurCount((c) => c + 1)
      void fetch(`/api/classroom/${id}/review/${setId}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'blur', attempt_id: attemptId }),
      })
    }

    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mode, attemptId, id, setId])

  async function publish() {
    await fetch(`/api/classroom/${id}/review/${setId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status === 'published' ? 'draft' : 'published' }),
    })
    await load()
  }

  async function addCard() {
    if (!editFront.trim() || !editBack.trim()) return
    const next = [
      ...items.map((it) => ({
        item_type: it.item_type,
        prompt: it.prompt,
        payload: it.payload,
      })),
      {
        item_type: 'flashcard' as const,
        prompt: editFront.trim(),
        payload: { front: editFront.trim(), back: editBack.trim() },
      },
    ]
    await fetch(`/api/classroom/${id}/review/${setId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: next }),
    })
    setEditFront('')
    setEditBack('')
    await load()
  }

  async function startTake() {
    setMsg(null)
    setResult(null)
    const res = await fetch(`/api/classroom/${id}/review/${setId}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    })
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error ?? 'Không bắt đầu được')
      return
    }
    const d = await res.json()
    setAttemptId(d.id)
    setAnswers({})
    setBlurCount(0)
    setMode('take')
  }

  async function submitTake() {
    if (!attemptId) return
    const res = await fetch(`/api/classroom/${id}/review/${setId}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        attempt_id: attemptId,
        answers,
        tab_blur_count: blurCount,
      }),
    })
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error ?? 'Nộp thất bại')
      return
    }
    const d = await res.json()
    setResult({
      score: Number(d.score),
      max_score: Number(d.max_score),
      tab_blur_count: d.tab_blur_count,
    })
    setMode('view')
    await load()
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link href={`/classroom/${id}/review`} className="text-sm text-muted-foreground hover:underline">
        Ôn tập
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground mt-1">Trạng thái: {status}</p>
        </div>
        {role === 'teacher' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
              className="rounded-lg border px-3 py-1.5 text-sm"
            >
              {mode === 'edit' ? 'Xong' : 'Sửa thẻ'}
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              className="rounded-lg bg-amber-700 text-white px-3 py-1.5 text-sm"
            >
              {status === 'published' ? 'Thu hồi' : 'Xuất bản'}
            </button>
          </div>
        )}
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
          Điểm: <strong>{result.score}/{result.max_score}</strong>
          {result.tab_blur_count > 0 && (
            <span className="text-amber-800"> · Chuyển tab: {result.tab_blur_count} lần</span>
          )}
        </div>
      )}

      {mode === 'edit' && role === 'teacher' && (
        <div className="rounded-xl border p-4 space-y-2">
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Mặt trước"
            value={editFront}
            onChange={(e) => setEditFront(e.target.value)}
          />
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Mặt sau / đáp án"
            value={editBack}
            onChange={(e) => setEditBack(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void addCard()}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            Thêm thẻ
          </button>
        </div>
      )}

      {role === 'student' && status === 'published' && mode !== 'take' && (
        <button
          type="button"
          onClick={() => void startTake()}
          className="rounded-lg bg-sky-700 text-white px-4 py-2 text-sm"
        >
          Bắt đầu làm bài
        </button>
      )}

      {mode === 'take' && (
        <div className="space-y-4">
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Đang làm bài — chuyển tab sẽ được ghi nhận ({blurCount} lần).
          </p>
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border p-4 space-y-2">
              <div className="font-medium text-sm">
                {String(item.payload.front ?? item.prompt)}
              </div>
              {item.item_type === 'flashcard' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1 text-sm"
                    onClick={() => setFlip((f) => ({ ...f, [item.id]: !f[item.id] }))}
                  >
                    {flip[item.id] ? String(item.payload.back) : 'Lật thẻ'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-green-700 text-white px-3 py-1 text-sm"
                    onClick={() => setAnswers((a) => ({ ...a, [item.id]: true }))}
                  >
                    Đã thuộc
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1 text-sm"
                    onClick={() => setAnswers((a) => ({ ...a, [item.id]: false }))}
                  >
                    Chưa thuộc
                  </button>
                </div>
              )}
              {(item.item_type === 'mcq' || item.item_type === 'written') && (
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Câu trả lời"
                  value={String(answers[item.id] ?? '')}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [item.id]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => void submitTake()}
            className="rounded-lg bg-sky-700 text-white px-4 py-2 text-sm"
          >
            Nộp bài & chấm điểm
          </button>
        </div>
      )}

      {mode !== 'take' && (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={item.id} className="rounded-xl border p-3 text-sm">
              <span className="text-muted-foreground mr-2">#{i + 1}</span>
              {String(item.payload.front ?? item.prompt)}
              {role === 'teacher' && item.payload.back != null && (
                <span className="text-muted-foreground"> → {String(item.payload.back)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {attempts.length > 0 && (
        <section>
          <h2 className="font-medium mb-2">Lịch sử điểm</h2>
          <ul className="text-sm space-y-1">
            {attempts.map((a) => (
              <li key={a.id} className="text-muted-foreground">
                {a.status}: {a.score ?? '—'}/{a.max_score ?? '—'}
                {a.tab_blur_count > 0 ? ` · blur ${a.tab_blur_count}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
