'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList } from 'lucide-react'

type Lesson = { id: string; lesson_index: number; title: string }

type AssignmentRow = {
  id: string
  title: string
  lesson_id: string
  classroom_lessons?: { lesson_index: number; title: string } | null
  my_submission?: { status: string; grades?: unknown } | null
}

const TILE =
  'w-[7.25rem] sm:w-[7.5rem] flex flex-col items-center text-center gap-1.5 rounded-lg border p-2.5 hover:bg-muted/50 transition'

export default function AssignmentsListPage() {
  return (
    <Suspense>
      <AssignmentsListInner />
    </Suspense>
  )
}

function AssignmentsListInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const createForLesson = searchParams.get('create')
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [assignRes, classRes] = await Promise.all([
      fetch(`/api/classroom/${id}/assignments`),
      fetch(`/api/classroom/${id}`),
    ])
    if (assignRes.ok) {
      const d = await assignRes.json()
      setRole(d.role)
      setAssignments(d.assignments ?? [])
    }
    if (classRes.ok) {
      const d = await classRes.json()
      const ls: Lesson[] = d.lessons ?? []
      setLessons(ls)
      if (d.role) setRole(d.role)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!createForLesson || role !== 'teacher' || lessons.length === 0) return
    const used = new Set(assignments.map((a) => a.lesson_id))
    if (used.has(createForLesson)) {
      const existing = assignments.find((a) => a.lesson_id === createForLesson)
      if (existing) router.replace(`/classroom/${id}/assignments/${existing.id}`)
      return
    }
    const lesson = lessons.find((l) => l.id === createForLesson)
    if (lesson) {
      setLessonId(createForLesson)
      setTitle('')
      setShowCreate(true)
      setMsg(null)
    }
  }, [createForLesson, role, lessons, assignments, id, router])

  const usedLessonIds = new Set(assignments.map((a) => a.lesson_id))
  const availableLessons = lessons.filter((l) => !usedLessonIds.has(l.id))

  async function createAssignment() {
    if (busy || !lessonId || !title.trim()) return
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/classroom/${id}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: lessonId, title: title.trim() }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Không tạo được')
      return
    }
    const created = await res.json()
    router.push(`/classroom/${id}/assignments/${created.id}`)
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {showCreate && availableLessons.length > 0 && (
        <div className="rounded-lg border p-3 max-w-lg space-y-2">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Tên bài tập"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <select
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
          >
            {availableLessons.map((l) => (
              <option key={l.id} value={l.id}>
                Buổi {l.lesson_index}: {l.title}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !title.trim() || !lessonId}
              onClick={() => void createAssignment()}
              className="rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Tạo
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setTitle('')
                setMsg(null)
              }}
              className="text-sm text-muted-foreground px-2"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex flex-wrap gap-3">
        {assignments.map((a) => {
          const lesson = a.classroom_lessons
          return (
            <Link
              key={a.id}
              href={`/classroom/${id}/assignments/${a.id}`}
              className={TILE}
            >
              <ClipboardList className="h-9 w-9 text-foreground/70" />
              <p className="text-xs font-medium line-clamp-2 w-full leading-snug">
                {a.title}
              </p>
              {lesson && (
                <p className="text-[10px] text-muted-foreground line-clamp-1 w-full">
                  Buổi {lesson.lesson_index}
                </p>
              )}
            </Link>
          )
        })}
      </div>

      {assignments.length === 0 && !showCreate && (
        <p className="text-sm text-muted-foreground">
          {role === 'teacher'
            ? 'Chưa có bài tập — tạo từ trang buổi học'
            : 'Chưa có bài tập'}
        </p>
      )}
    </div>
  )
}
