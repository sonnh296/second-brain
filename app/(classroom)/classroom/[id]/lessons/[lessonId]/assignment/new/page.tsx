'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import { AssignmentEditor } from '@/components/classroom/assignment-editor'

export default function NewAssignmentPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>()
  const router = useRouter()
  const [className, setClassName] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [lessonRes, classRes] = await Promise.all([
        fetch(`/api/classroom/${id}/lessons/${lessonId}`),
        fetch(`/api/classroom/${id}`),
      ])
      if (lessonRes.ok) {
        const d = await lessonRes.json()
        setLessonTitle(d.lesson?.title ?? '')
        if (d.role !== 'teacher') {
          router.replace(`/classroom/${id}/lessons/${lessonId}/assignment`)
        }
      }
      if (classRes.ok) {
        const c = await classRes.json()
        setClassName(c.classroom?.name ?? '')
      }
    })()
  }, [id, lessonId, router])

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
    router.push(`/classroom/${id}/assignments/${created.id}`)
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-4xl mx-auto w-full">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp', href: `/classroom/${id}` },
          { label: lessonTitle || 'Buổi học', href: `/classroom/${id}/lessons/${lessonId}` },
          { label: 'Bài tập', href: `/classroom/${id}/lessons/${lessonId}/assignment` },
          { label: 'Tạo mới' },
        ]}
      />

      <h2 className="text-base font-semibold">Tạo bài tập</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assign-title">Tên bài tập</Label>
          <Input
            id="assign-title"
            placeholder="Ví dụ: Bài tập 1 — Hàm số"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label>Đề bài</Label>
          <AssignmentEditor
            value={description}
            onChange={setDescription}
            placeholder="Soạn đề bài, yêu cầu, gợi ý..."
            disabled={busy}
            minHeightClass="min-h-[420px]"
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => router.push(`/classroom/${id}/lessons/${lessonId}/assignment`)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void createAssignment()}
          >
            {busy ? 'Đang tạo...' : 'Tạo bài tập'}
          </Button>
        </div>
      </div>
    </div>
  )
}
