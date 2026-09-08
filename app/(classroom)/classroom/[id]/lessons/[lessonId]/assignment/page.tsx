'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import { ClassroomModal } from '@/components/classroom/classroom-modal'

export default function LessonAssignmentPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [lessonTitle, setLessonTitle] = useState('')
  const [assignment, setAssignment] = useState<{
    id: string
    title: string
    description: string | null
  } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/classroom/${id}/lessons/${lessonId}`)
    if (!res.ok) {
      setError('Không tải được buổi học')
      setLoading(false)
      return
    }
    const data = await res.json()
    setRole(data.role)
    setLessonTitle(data.lesson?.title ?? '')
    setAssignment(data.assignment ?? null)
    setLoading(false)

    if (data.assignment?.id) {
      router.replace(`/classroom/${id}/assignments/${data.assignment.id}`)
    }
  }, [id, lessonId, router])

  useEffect(() => {
    void load()
  }, [load])

  async function createAssignment() {
    if (busy || !title.trim()) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/classroom/${id}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lesson_id: lessonId,
        title: title.trim(),
        description: description.trim() || undefined,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Không tạo được bài tập')
      return
    }
    const created = await res.json()
    setCreateOpen(false)
    router.push(`/classroom/${id}/assignments/${created.id}`)
  }

  if (loading) {
    return <ClassroomLoading label="Đang mở bài tập..." />
  }

  if (assignment) {
    return <ClassroomLoading label="Đang chuyển tới bài tập..." />
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-xl">
      <div className="flex items-center gap-2">
        <Link
          href={`/classroom/${id}/lessons/${lessonId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {lessonTitle || 'Buổi học'}
        </Link>
      </div>

      <h2 className="text-base font-semibold">Bài tập</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {role === 'teacher' ? (
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Buổi này chưa có bài tập. Tạo đề bài để học sinh nộp bài.
          </p>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Tạo bài tập
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Giáo viên chưa đăng bài tập cho buổi này.
        </p>
      )}

      <ClassroomModal
        open={createOpen}
        title="Tạo bài tập"
        onClose={() => {
          if (!busy) setCreateOpen(false)
        }}
        busy={busy}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setCreateOpen(false)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !title.trim()}
              onClick={() => void createAssignment()}
            >
              {busy ? 'Đang tạo...' : 'Tạo'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="assign-title">Tên bài tập</Label>
            <Input
              id="assign-title"
              placeholder="Ví dụ: Bài tập buổi 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assign-desc">Đề bài</Label>
            <Textarea
              id="assign-desc"
              placeholder="Mô tả yêu cầu, hướng dẫn nộp bài..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              disabled={busy}
              className="resize-y"
            />
          </div>
        </div>
      </ClassroomModal>
    </div>
  )
}
