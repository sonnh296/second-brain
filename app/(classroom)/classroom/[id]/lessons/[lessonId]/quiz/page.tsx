'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { BookOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClassroomModal } from '@/components/classroom/classroom-modal'
import { ClassroomLoading, ClassroomTileSkeleton } from '@/components/classroom/classroom-loading'

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
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [sets, setSets] = useState<ReviewSet[]>([])
  const [title, setTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lessonTitle, setLessonTitle] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
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
    setLoading(false)
  }, [id, lessonId])

  useEffect(() => {
    void load()
  }, [load])

  async function createQuiz() {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/classroom/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim() || `Ôn tập — ${lessonTitle || 'buổi'}`,
        set_type: 'quiz',
        lesson_id: lessonId,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Không tạo được')
      return
    }
    const set = await res.json()
    setShowCreate(false)
    setTitle('')
    router.push(`/classroom/${id}/review/${set.id}`)
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <div className="h-6 w-48 rounded bg-muted/60 animate-pulse" />
        <ClassroomTileSkeleton count={3} />
        <ClassroomLoading label="Đang tải ôn tập..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <h2 className="text-base font-semibold">Ôn tập · {lessonTitle}</h2>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex flex-wrap gap-3">
        {role === 'teacher' && (
          <button
            type="button"
            onClick={() => {
              setTitle('')
              setMsg(null)
              setShowCreate(true)
            }}
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
        <p className="text-sm text-muted-foreground">Chưa có bộ ôn tập</p>
      )}

      <ClassroomModal
        open={showCreate}
        title="Tạo ôn tập"
        onClose={() => {
          if (!busy) setShowCreate(false)
        }}
        busy={busy}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowCreate(false)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy}
              onClick={() => void createQuiz()}
            >
              {busy ? 'Đang tạo...' : 'Tạo'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="quiz-title">Tên bộ ôn</Label>
          <Input
            id="quiz-title"
            placeholder={`Ôn tập — ${lessonTitle || 'buổi'}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createQuiz()}
            autoFocus
            disabled={busy}
          />
        </div>
      </ClassroomModal>
    </div>
  )
}
