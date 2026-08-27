'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { BookOpen, Plus } from 'lucide-react'

type ReviewSet = {
  id: string
  title: string
  set_type: string
  status: string
  lesson_id?: string | null
}

const TILE =
  'w-[7.25rem] sm:w-[7.5rem] flex flex-col items-center text-center gap-1.5 rounded-lg border p-2.5 hover:bg-muted/50 transition'

export default function LessonQuizPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>()
  const router = useRouter()
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [sets, setSets] = useState<ReviewSet[]>([])
  const [title, setTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lessonTitle, setLessonTitle] = useState('')

  const load = useCallback(async () => {
    const [lessonRes, reviewRes] = await Promise.all([
      fetch(`/api/classroom/${id}/lessons/${lessonId}`),
      fetch(`/api/classroom/${id}/review?lesson_id=${lessonId}`),
    ])
    if (lessonRes.ok) {
      const d = await lessonRes.json()
      setLessonTitle(d.lesson?.title ?? '')
      setRole(d.role)
    }
    if (reviewRes.ok) {
      const d = await reviewRes.json()
      setSets(d.sets ?? [])
      if (d.role) setRole(d.role)
    }
  }, [id, lessonId])

  useEffect(() => {
    void load()
  }, [load])

  async function createQuiz() {
    if (busy) return
    setBusy(true)
    const res = await fetch(`/api/classroom/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim() || `Quiz — ${lessonTitle || 'buổi'}`,
        set_type: 'quiz',
        lesson_id: lessonId,
      }),
    })
    setBusy(false)
    if (!res.ok) return
    const set = await res.json()
    router.push(`/classroom/${id}/review/${set.id}`)
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <h2 className="text-base font-semibold">Quiz · {lessonTitle}</h2>

      {showCreate && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 max-w-lg">
          <input
            className="flex-1 min-w-[140px] rounded-md border px-3 py-2 text-sm"
            placeholder="Tên quiz"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createQuiz()}
            autoFocus
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void createQuiz()}
            className="rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Tạo
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-sm text-muted-foreground px-2"
          >
            Hủy
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {role === 'teacher' && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className={`${TILE} border-dashed text-muted-foreground hover:text-foreground cursor-pointer`}
          >
            <Plus className="h-8 w-8" />
            <p className="text-xs font-medium">Thêm mới</p>
          </button>
        )}
        {sets.map((s) => (
          <Link key={s.id} href={`/classroom/${id}/review/${s.id}`} className={TILE}>
            <BookOpen className="h-9 w-9 text-foreground/70" />
            <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{s.title}</p>
            <p className="text-[10px] text-muted-foreground">{s.status}</p>
          </Link>
        ))}
      </div>

      {sets.length === 0 && !showCreate && (
        <p className="text-sm text-muted-foreground">Chưa có quiz</p>
      )}
    </div>
  )
}
