'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Folder, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { ClassroomLoading, ClassroomTileSkeleton } from '@/components/classroom/classroom-loading'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import { ClassroomModal } from '@/components/classroom/classroom-modal'
import { useConfirm } from '@/components/ui/confirm-dialog'
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

function LessonTile({
  lesson,
  classroomId,
  role,
  incomplete,
  onDeleted,
}: {
  lesson: Lesson
  classroomId: string
  role: 'teacher' | 'student'
  incomplete: number
  onDeleted: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { confirm, dialog } = useConfirm()

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(false)
    const ok = await confirm({
      title: `Xóa "${lesson.title}"?`,
      description:
        'Buổi học cùng tài liệu và bài tập bên trong sẽ được chuyển vào thùng rác. Chat sẽ không tìm thấy nội dung này.',
      confirmLabel: 'Xóa vào thùng rác',
    })
    if (!ok) return
    setBusy(true)
    const res = await fetch(`/api/classroom/${classroomId}/lessons/${lesson.id}`, {
      method: 'DELETE',
    })
    setBusy(false)
    if (res.ok) onDeleted()
  }

  return (
    <div className="relative group">
      <Link
        href={`/classroom/${classroomId}/lessons/${lesson.id}`}
        className={`${TILE} ${busy ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Folder className="h-7 w-7 text-sky-600" />
        <p className="text-[11px] font-medium line-clamp-2 w-full leading-snug">{lesson.title}</p>
        {role === 'student' && incomplete > 0 && (
          <p className="text-[10px] text-amber-700 leading-tight">
            {incomplete} bài tập chưa hoàn thành
          </p>
        )}
      </Link>

      {role === 'teacher' && (
        <>
          <button
            type="button"
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted bg-background/80 cursor-pointer"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            aria-label="Tùy chọn buổi học"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute top-7 right-1 z-10 bg-popover border rounded-md shadow-md py-1 min-w-[120px]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-muted cursor-pointer flex items-center gap-1.5"
                onClick={(e) => void handleDelete(e)}
                disabled={busy}
              >
                <Trash2 className="h-3 w-3" />
                Xóa
              </button>
            </div>
          )}
        </>
      )}
      {dialog}
    </div>
  )
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
        {lessons.map((l) => (
          <LessonTile
            key={l.id}
            lesson={l}
            classroomId={id}
            role={role}
            incomplete={l.incomplete_assignments ?? 0}
            onDeleted={() => void load()}
          />
        ))}
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
