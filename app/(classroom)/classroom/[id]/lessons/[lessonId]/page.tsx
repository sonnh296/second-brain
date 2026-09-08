'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ClipboardList, FileIcon as FileLucide, HelpCircle, Loader2, Plus } from 'lucide-react'
import { ClassroomLoading, ClassroomTileSkeleton } from '@/components/classroom/classroom-loading'
import { ClassroomUploadModal } from '@/components/classroom/classroom-upload-modal'
import {
  ClassroomDocumentPreview,
  type ClassroomDocRow,
} from '@/components/classroom/classroom-document-preview'

type Doc = ClassroomDocRow & {
  file_type?: string
}

const TILE =
  'w-[7.25rem] sm:w-[7.5rem] flex flex-col items-center text-center gap-1.5 rounded-lg border p-2.5 hover:bg-muted/50 transition'

function statusLabel(status: string) {
  if (status === 'pending' || status === 'processing') return 'Đang xử lý...'
  if (status === 'failed') return 'Lỗi'
  if (status === 'done') return 'Xong'
  return status
}

export default function LessonDetailPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<'teacher' | 'student' | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [hasAssignment, setHasAssignment] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ClassroomDocRow | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const res = await fetch(`/api/classroom/${id}/lessons/${lessonId}`)
    if (!res.ok) {
      setMsg('Không tải được buổi học')
      setLoading(false)
      return
    }
    const data = await res.json()
    setTitle(data.lesson.title)
    setRole(data.role)
    setFolderId(data.folder?.id ?? null)
    setDocs(data.documents ?? [])
    setHasAssignment(Boolean(data.assignment))
    setLoading(false)
  }, [id, lessonId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const pending = docs.some((d) => d.status === 'pending' || d.status === 'processing')
    if (!pending) return
    const t = window.setInterval(() => {
      void load({ silent: true })
    }, 4000)
    return () => window.clearInterval(t)
  }, [docs, load])

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <div className="h-6 w-40 rounded bg-muted/60 animate-pulse" />
        <ClassroomTileSkeleton count={3} />
        <ClassroomLoading label="Đang tải buổi học..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/classroom/${id}/lessons/${lessonId}/assignment`}
          className={TILE}
        >
          <ClipboardList className="h-9 w-9 text-foreground/70" />
          <p className="text-xs font-medium line-clamp-2 w-full leading-snug">Bài tập</p>
          {!hasAssignment && (
            <p className="text-[10px] text-muted-foreground">
              {role === 'teacher' ? 'Tạo đề' : 'Chưa có'}
            </p>
          )}
        </Link>

        <Link
          href={`/classroom/${id}/lessons/${lessonId}/quiz`}
          className={TILE}
        >
          <HelpCircle className="h-9 w-9 text-foreground/70" />
          <p className="text-xs font-medium line-clamp-2 w-full leading-snug">Ôn tập</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {role === 'teacher' && (
          <button
            type="button"
            disabled={!folderId}
            onClick={() => setUploadOpen(true)}
            className={`${TILE} border-dashed text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50`}
          >
            <Plus className="h-8 w-8" />
            <p className="text-xs font-medium">Thêm tài liệu</p>
          </button>
        )}

        {docs.map((d) => {
          const processing = d.status === 'pending' || d.status === 'processing'
          return (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                setPreviewDoc({
                  id: d.id,
                  filename: d.filename,
                  file_type: d.file_type || 'bin',
                  file_size_bytes: d.file_size_bytes ?? 0,
                  status: d.status,
                  chunk_count: d.chunk_count,
                  error_message: d.error_message ?? null,
                  created_at: d.created_at,
                })
              }
              className={`${TILE} cursor-pointer`}
            >
              {processing ? (
                <Loader2 className="h-9 w-9 text-primary/70 animate-spin" />
              ) : (
                <FileLucide className="h-9 w-9 text-foreground/60" />
              )}
              <p className="text-xs font-medium line-clamp-2 w-full leading-snug">
                {d.filename}
              </p>
              <p
                className={`text-[10px] ${
                  d.status === 'failed'
                    ? 'text-red-600'
                    : processing
                      ? 'text-amber-700'
                      : 'text-muted-foreground'
                }`}
              >
                {statusLabel(d.status)}
              </p>
            </button>
          )
        })}
      </div>

      {folderId && (
        <ClassroomUploadModal
          open={uploadOpen}
          classroomId={id}
          folderId={folderId}
          onClose={() => setUploadOpen(false)}
          onDone={() => void load({ silent: true })}
        />
      )}

      <ClassroomDocumentPreview
        open={Boolean(previewDoc)}
        classroomId={id}
        doc={previewDoc}
        role={role === 'teacher' ? 'teacher' : 'student'}
        onClose={() => setPreviewDoc(null)}
        onDeleted={() => void load({ silent: true })}
      />
    </div>
  )
}
