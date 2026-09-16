'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Folder, Plus } from 'lucide-react'
import { ClassroomLoading, ClassroomTileSkeleton } from '@/components/classroom/classroom-loading'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import { ClassroomModal } from '@/components/classroom/classroom-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Lesson = {
  id: string
  lesson_index: number
  title: string
  incomplete_assignments?: number
}

const TILE =
  'w-[6.25rem] sm:w-[6.5rem] flex flex-col items-center text-center gap-1 rounded-lg border p-2 hover:bg-muted/50 transition'

function nextLessonTitle(lessons: Lesson[]) {
  const nextIndex = lessons.reduce((max, l) => Math.max(max, l.lesson_index), 0) + 1
  return `Buổi ${nextIndex}`
}

export default function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [className, setClassName] = useState('')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [lessonName, setLessonName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/classroom/${id}`)
    if (!res.ok) {
      setError('Không tải được lớp')
      setLoading(false)
      return
    }
    const data = await res.json()
    setRole(data.role)
    setClassName(data.classroom?.name ?? '')
    setLessons(data.lessons ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  function openAddModal() {
    setError(null)
    setLessonName(nextLessonTitle(lessons))
    setAddOpen(true)
  }

  function closeAddModal() {
    if (busy) return
    setAddOpen(false)
  }

  async function addLesson() {
    if (busy) return
    const title = lessonName.trim()
    if (!title) {
      setError('Nhập tên buổi học')
      return
    }
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/classroom/${id}/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    setBusy(false)
    if (res.ok) {
      const lesson = await res.json()
      setAddOpen(false)
      router.push(`/classroom/${id}/lessons/${lesson.id}`)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Không tạo được buổi')
    }
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <ClassroomTileSkeleton count={4} />
        <ClassroomLoading label="Đang tải buổi học..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp' },
          { label: 'Buổi học' },
        ]}
      />
      {error && !addOpen && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2.5">
        {role === 'teacher' && (
          <button
            type="button"
            disabled={busy}
            onClick={openAddModal}
            className={`${TILE} border-dashed text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer`}
          >
            <Plus className="h-7 w-7" />
            <p className="text-[11px] font-medium">Thêm buổi</p>
          </button>
        )}
        {lessons.map((l) => {
          const incomplete = l.incomplete_assignments ?? 0
          return (
            <Link key={l.id} href={`/classroom/${id}/lessons/${l.id}`} className={TILE}>
              <Folder className="h-7 w-7 text-sky-600" />
              <p className="text-[11px] font-medium line-clamp-2 w-full leading-snug">{l.title}</p>
              {role === 'student' && incomplete > 0 && (
                <p className="text-[10px] text-amber-700 leading-tight">
                  {incomplete} bài tập chưa hoàn thành
                </p>
              )}
            </Link>
          )
        })}
      </div>

      {lessons.length === 0 && role === 'student' && (
        <p className="text-sm text-muted-foreground text-center py-8">Chưa có buổi học</p>
      )}

      <ClassroomModal
        open={addOpen}
        title="Thêm buổi học"
        onClose={closeAddModal}
        busy={busy}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={closeAddModal} disabled={busy}>
              Hủy
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !lessonName.trim()}
              onClick={() => void addLesson()}
            >
              {busy ? 'Đang tạo...' : 'Tạo buổi'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="lesson-name">Tên buổi</Label>
          <Input
            id="lesson-name"
            placeholder="Ví dụ: Buổi 1"
            value={lessonName}
            onChange={(e) => setLessonName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addLesson()}
            autoFocus
            disabled={busy}
            maxLength={200}
          />
        </div>
        {error && addOpen && <p className="text-sm text-destructive">{error}</p>}
      </ClassroomModal>
    </div>
  )
}
