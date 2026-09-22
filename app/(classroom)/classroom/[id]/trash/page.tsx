'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Folder, RotateCcw, Trash2 } from 'lucide-react'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import { FileIcon } from '@/components/documents/file-icon'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'

type TrashLesson = {
  id: string
  lesson_index: number
  title: string
  deleted_at: string
}

type TrashDoc = {
  id: string
  filename: string
  file_type: string
  file_size_bytes: number
  deleted_at: string
}

export default function ClassroomTrashPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { confirm, dialog } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [className, setClassName] = useState('')
  const [lessons, setLessons] = useState<TrashLesson[]>([])
  const [docs, setDocs] = useState<TrashDoc[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [meta, trash] = await Promise.all([
      fetch(`/api/classroom/${id}`),
      fetch(`/api/classroom/${id}/trash`),
    ])
    if (!meta.ok) {
      setError('Không tải được lớp')
      setLoading(false)
      return
    }
    const m = await meta.json()
    if (m.role !== 'teacher') {
      router.replace(`/classroom/${id}`)
      return
    }
    setClassName(m.classroom?.name ?? '')
    if (!trash.ok) {
      setError('Không tải được thùng rác')
      setLoading(false)
      return
    }
    const t = await trash.json()
    setLessons(t.lessons ?? [])
    setDocs(t.documents ?? [])
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    void load()
  }, [load])

  async function restoreLesson(lessonId: string) {
    setBusyId(lessonId)
    const res = await fetch(`/api/classroom/${id}/lessons/${lessonId}/restore`, {
      method: 'POST',
    })
    setBusyId(null)
    if (!res.ok) {
      setError('Không khôi phục được buổi học')
      return
    }
    void load()
  }

  async function purgeLesson(lessonId: string, title: string) {
    const ok = await confirm({
      title: `Xóa vĩnh viễn "${title}"?`,
      description: 'Buổi học, tài liệu và bài tập sẽ bị xóa vĩnh viễn. Không thể khôi phục.',
      confirmLabel: 'Xóa vĩnh viễn',
    })
    if (!ok) return
    setBusyId(lessonId)
    const res = await fetch(`/api/classroom/${id}/lessons/${lessonId}?permanent=1`, {
      method: 'DELETE',
    })
    setBusyId(null)
    if (!res.ok) {
      setError('Không xóa được buổi học')
      return
    }
    void load()
  }

  async function restoreDoc(docId: string) {
    setBusyId(docId)
    const res = await fetch(`/api/classroom/${id}/documents/${docId}/restore`, {
      method: 'POST',
    })
    setBusyId(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Không khôi phục được tài liệu')
      return
    }
    void load()
  }

  async function purgeDoc(docId: string, filename: string) {
    const ok = await confirm({
      title: `Xóa vĩnh viễn "${filename}"?`,
      description: 'Không thể khôi phục sau khi xóa.',
      confirmLabel: 'Xóa vĩnh viễn',
    })
    if (!ok) return
    setBusyId(docId)
    const res = await fetch(`/api/classroom/${id}/documents/${docId}?permanent=1`, {
      method: 'DELETE',
    })
    setBusyId(null)
    if (!res.ok) {
      setError('Không xóa được tài liệu')
      return
    }
    void load()
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <ClassroomLoading label="Đang tải thùng rác..." className="py-8" />
      </div>
    )
  }

  const empty = lessons.length === 0 && docs.length === 0

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp', href: `/classroom/${id}` },
          { label: 'Thùng rác' },
        ]}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {empty ? (
        <p className="text-sm text-muted-foreground text-center py-12">Thùng rác trống</p>
      ) : (
        <div className="space-y-6">
          {lessons.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Buổi học
              </p>
              <ul className="divide-y rounded-lg border">
                {lessons.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <Folder className="h-5 w-5 text-sky-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{l.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Đã xóa{' '}
                        {new Date(l.deleted_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 shrink-0"
                      disabled={busyId === l.id}
                      onClick={() => void restoreLesson(l.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Khôi phục
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8 gap-1 shrink-0"
                      disabled={busyId === l.id}
                      onClick={() => void purgeLesson(l.id, l.title)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {docs.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Tài liệu
              </p>
              <ul className="divide-y rounded-lg border">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                    <FileIcon type={d.file_type} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{d.filename}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Đã xóa{' '}
                        {new Date(d.deleted_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 shrink-0"
                      disabled={busyId === d.id}
                      onClick={() => void restoreDoc(d.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Khôi phục
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8 gap-1 shrink-0"
                      disabled={busyId === d.id}
                      onClick={() => void purgeDoc(d.id, d.filename)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {dialog}
    </div>
  )
}
