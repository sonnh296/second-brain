'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ClipboardList, HelpCircle, Plus, Trash2, X } from 'lucide-react'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import { ClassroomUploadModal } from '@/components/classroom/classroom-upload-modal'
import {
  ClassroomDocumentPreview,
  type ClassroomDocRow,
} from '@/components/classroom/classroom-document-preview'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import { ClassroomDocGridItem } from '@/components/classroom/classroom-doc-grid'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'

type Doc = ClassroomDocRow & {
  file_type?: string
}

const ACTION_TILE =
  'flex-1 min-w-[7rem] max-w-[10rem] rounded-lg border bg-background/80 px-3 py-2.5 flex items-center gap-2.5 hover:border-primary/40 hover:bg-background transition'

const DOC_TILE_ADD =
  'rounded-lg border border-dashed bg-card p-2.5 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition cursor-pointer disabled:opacity-50 min-h-[7.5rem]'

export default function LessonDetailPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [className, setClassName] = useState('')
  const [role, setRole] = useState<'teacher' | 'student' | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [assignmentCount, setAssignmentCount] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ClassroomDocRow | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const [lessonRes, classRes] = await Promise.all([
      fetch(`/api/classroom/${id}/lessons/${lessonId}`),
      fetch(`/api/classroom/${id}`),
    ])
    if (!lessonRes.ok) {
      setMsg('Không tải được buổi học')
      setLoading(false)
      return
    }
    const data = await lessonRes.json()
    setTitle(data.lesson.title)
    setRole(data.role)
    setFolderId(data.folder?.id ?? null)
    setDocs(data.documents ?? [])
    setAssignmentCount((data.assignments ?? []).length)
    if (classRes.ok) {
      const c = await classRes.json()
      setClassName(c.classroom?.name ?? '')
    }
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

  function toggleSelect(docId: string) {
    setSelectionMode(true)
    setSelectedIds((prev) =>
      prev.includes(docId) ? prev.filter((x) => x !== docId) : [...prev, docId]
    )
  }

  function clearSelection() {
    setSelectedIds([])
    setSelectionMode(false)
  }

  async function deleteDocs(ids: string[]) {
    if (ids.length === 0) return
    const ok = await confirm({
      title: ids.length === 1 ? 'Xóa tài liệu này?' : `Xóa ${ids.length} tài liệu?`,
      description: 'Tài liệu sẽ được chuyển vào thùng rác. Chat sẽ không tìm thấy nội dung này.',
      confirmLabel: 'Xóa vào thùng rác',
    })
    if (!ok) return
    setBusy(true)
    setMsg(null)
    await Promise.all(
      ids.map((docId) =>
        fetch(`/api/classroom/${id}/documents/${docId}`, { method: 'DELETE' })
      )
    )
    setBusy(false)
    if (previewDoc && ids.includes(previewDoc.id)) setPreviewDoc(null)
    clearSelection()
    void load({ silent: true })
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <ClassroomLoading label="Đang tải buổi học..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp', href: `/classroom/${id}` },
          { label: 'Buổi học', href: `/classroom/${id}` },
          { label: title || 'Buổi' },
        ]}
      />

      <h2 className="text-base font-semibold">{title}</h2>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="rounded-xl bg-muted/50 border px-3 py-2.5 flex flex-wrap gap-2">
        <Link
          href={`/classroom/${id}/lessons/${lessonId}/assignment`}
          className={ACTION_TILE}
        >
          <ClipboardList className="h-5 w-5 shrink-0 text-foreground/70" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">Bài tập</p>
            <p className="text-[10px] text-muted-foreground">
              {assignmentCount === 0
                ? role === 'teacher'
                  ? 'Tạo đề'
                  : 'Chưa có'
                : `${assignmentCount} bài`}
            </p>
          </div>
        </Link>

        <Link href={`/classroom/${id}/lessons/${lessonId}/quiz`} className={ACTION_TILE}>
          <HelpCircle className="h-5 w-5 shrink-0 text-foreground/70" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">Ôn tập</p>
            <p className="text-[10px] text-muted-foreground">Flashcard / quiz</p>
          </div>
        </Link>
      </div>

      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tài liệu
          </p>
          {role === 'teacher' && docs.length > 0 && !selectionMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectionMode(true)}
            >
              Chọn
            </Button>
          )}
        </div>

        {selectionMode && role === 'teacher' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium">{selectedIds.length} đã chọn</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedIds(docs.map((d) => d.id))}
              disabled={busy}
            >
              Chọn tất cả
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={busy || selectedIds.length === 0}
              onClick={() => void deleteDocs(selectedIds)}
            >
              <Trash2 className="h-3 w-3" />
              Xóa
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 ml-auto"
              onClick={clearSelection}
              aria-label="Bỏ chọn"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5"
          onClick={(e) => {
            if (
              selectionMode &&
              !(e.target as HTMLElement).closest('[data-selectable],button')
            ) {
              clearSelection()
            }
          }}
        >
          {role === 'teacher' && !selectionMode && (
            <button
              type="button"
              disabled={!folderId}
              onClick={() => setUploadOpen(true)}
              className={DOC_TILE_ADD}
            >
              <Plus className="h-6 w-6" />
              <p className="text-[11px] font-medium">Thêm tài liệu</p>
            </button>
          )}

          {docs.map((d) => {
            const row: ClassroomDocRow = {
              id: d.id,
              filename: d.filename,
              file_type: d.file_type || 'bin',
              file_size_bytes: d.file_size_bytes ?? 0,
              status: d.status,
              chunk_count: d.chunk_count,
              error_message: d.error_message ?? null,
              created_at: d.created_at,
            }
            return (
              <ClassroomDocGridItem
                key={d.id}
                classroomId={id}
                doc={row}
                onOpen={() => setPreviewDoc(row)}
                canDelete={role === 'teacher'}
                onDelete={() => void deleteDocs([d.id])}
                selected={selectedIds.includes(d.id)}
                selectionMode={selectionMode}
                onSelect={role === 'teacher' ? toggleSelect : undefined}
              />
            )
          })}
        </div>

        {docs.length === 0 && role === 'student' && (
          <p className="text-sm text-muted-foreground">Chưa có tài liệu</p>
        )}
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
        onRequestDelete={
          role === 'teacher' && previewDoc
            ? () => void deleteDocs([previewDoc.id])
            : undefined
        }
      />

      {confirmDialog}
    </div>
  )
}
