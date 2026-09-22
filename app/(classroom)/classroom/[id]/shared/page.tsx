'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Trash2, X } from 'lucide-react'
import { ClassroomUploadModal } from '@/components/classroom/classroom-upload-modal'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import {
  ClassroomDocumentPreview,
  type ClassroomDocRow,
} from '@/components/classroom/classroom-document-preview'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import {
  ClassroomAddDocTile,
  ClassroomDocGridItem,
} from '@/components/classroom/classroom-doc-grid'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'

type Doc = ClassroomDocRow

export default function SharedMaterialsPage() {
  const { id } = useParams<{ id: string }>()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [className, setClassName] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ClassroomDocRow | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const meta = await fetch(`/api/classroom/${id}`)
    if (!meta.ok) {
      setLoading(false)
      return
    }
    const data = await meta.json()
    setRole(data.role)
    setClassName(data.classroom?.name ?? '')
    const fid = data.shared_folder?.id as string | undefined
    if (!fid) {
      setLoading(false)
      return
    }
    setFolderId(fid)
    const res = await fetch(`/api/classroom/${id}/documents?folder_id=${fid}`)
    if (res.ok) {
      const d = await res.json()
      setDocs(d.documents ?? [])
    }
    setLoading(false)
  }, [id])

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
        <ClassroomLoading label="Đang tải tài liệu chung..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp', href: `/classroom/${id}` },
          { label: 'Tài liệu chung' },
        ]}
      />

      {msg && <p className="text-sm text-red-600">{msg}</p>}

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
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
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
          <ClassroomAddDocTile
            disabled={!folderId}
            onClick={() => {
              setMsg(null)
              setUploadOpen(true)
            }}
          />
        )}

        {docs.map((d) => (
          <ClassroomDocGridItem
            key={d.id}
            classroomId={id}
            doc={d}
            onOpen={() => setPreviewDoc(d)}
            canDelete={role === 'teacher'}
            onDelete={() => void deleteDocs([d.id])}
            selected={selectedIds.includes(d.id)}
            selectionMode={selectionMode}
            onSelect={role === 'teacher' ? toggleSelect : undefined}
          />
        ))}
      </div>

      {docs.length === 0 && role === 'student' && (
        <p className="text-sm text-muted-foreground">Trống</p>
      )}

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
        role={role}
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
