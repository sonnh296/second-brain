'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList } from 'lucide-react'

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

/** Legacy list route — bài tập được tạo/xem từ từng buổi học. */
function AssignmentsListInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const createForLesson = searchParams.get('create')
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])

  const load = useCallback(async () => {
    const assignRes = await fetch(`/api/classroom/${id}/assignments`)
    if (assignRes.ok) {
      const d = await assignRes.json()
      setRole(d.role)
      setAssignments(d.assignments ?? [])
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!createForLesson) return
    const existing = assignments.find((a) => a.lesson_id === createForLesson)
    if (existing) {
      router.replace(`/classroom/${id}/assignments/${existing.id}`)
      return
    }
    // Redirect teachers back to the lesson to create via popup.
    router.replace(`/classroom/${id}/lessons/${createForLesson}`)
  }, [createForLesson, assignments, id, router])

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Bài tập thuộc từng buổi học. Mở một buổi để xem hoặc tạo bài tập.
      </p>

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

      {assignments.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {role === 'teacher'
            ? 'Chưa có bài tập — tạo từ trang buổi học'
            : 'Chưa có bài tập'}
        </p>
      )}
    </div>
  )
}
