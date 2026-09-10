'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'

type AssignmentRow = {
  id: string
  title: string
  description: string | null
  created_at: string
  my_submission?: { status: string } | null
}

const TILE =
  'rounded-xl border bg-card p-3 flex flex-col items-center text-center gap-2 hover:shadow-md hover:border-primary/30 transition min-h-[8rem]'

export default function LessonAssignmentPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [className, setClassName] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [res, classRes] = await Promise.all([
      fetch(`/api/classroom/${id}/lessons/${lessonId}`),
      fetch(`/api/classroom/${id}`),
    ])
    if (!res.ok) {
      setError('Không tải được buổi học')
      setLoading(false)
      return
    }
    const data = await res.json()
    setRole(data.role)
    setLessonTitle(data.lesson?.title ?? '')
    const list = (data.assignments ?? []) as AssignmentRow[]

    if (data.role === 'student' && list.length > 0) {
      const allRes = await fetch(`/api/classroom/${id}/assignments`)
      if (allRes.ok) {
        const all = await allRes.json()
        const byId = new Map(
          (all.assignments ?? []).map(
            (a: AssignmentRow & { my_submission?: { status: string } }) => [
              a.id,
              a.my_submission ?? null,
            ]
          )
        )
        setAssignments(
          list.map((a) => ({
            ...a,
            my_submission: (byId.get(a.id) as { status: string } | null) ?? null,
          }))
        )
      } else {
        setAssignments(list)
      }
    } else {
      setAssignments(list)
    }

    if (classRes.ok) {
      const c = await classRes.json()
      setClassName(c.classroom?.name ?? '')
    }
    setLoading(false)
  }, [id, lessonId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <ClassroomLoading label="Đang mở bài tập..." />
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp', href: `/classroom/${id}` },
          { label: lessonTitle || 'Buổi học', href: `/classroom/${id}/lessons/${lessonId}` },
          { label: 'Bài tập' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Bài tập</h2>
        {role === 'teacher' && (
          <Link
            href={`/classroom/${id}/lessons/${lessonId}/assignment/new`}
            className="ml-auto inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Thêm bài tập
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {assignments.map((a) => (
          <Link key={a.id} href={`/classroom/${id}/assignments/${a.id}`} className={TILE}>
            <ClipboardList className="h-9 w-9 text-foreground/70" />
            <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{a.title}</p>
            {role === 'student' && (
              <p className="text-[10px] text-muted-foreground">
                {!a.my_submission
                  ? 'Chưa nộp'
                  : a.my_submission.status === 'graded'
                    ? 'Đã chấm'
                    : a.my_submission.status === 'submitted'
                      ? 'Đã nộp'
                      : 'Nháp'}
              </p>
            )}
          </Link>
        ))}
      </div>

      {assignments.length === 0 && (
        <div className="rounded-xl border p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {role === 'teacher'
              ? 'Buổi này chưa có bài tập. Tạo bài đầu tiên.'
              : 'Giáo viên chưa đăng bài tập cho buổi này.'}
          </p>
          {role === 'teacher' && (
            <Link
              href={`/classroom/${id}/lessons/${lessonId}/assignment/new`}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Tạo bài tập
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
