'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FileIcon } from '@/components/documents/file-icon'
import { StatusBadge } from '@/components/documents/document-grid'
import {
  ContentPreview,
  ContentPreviewFooter,
  OcrDetailsSection,
  SubtitlesPanel,
} from '@/components/documents/document-preview-panel'
import type { PreviewData } from '@/components/documents/types'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/usage/format'
import { TYPE_LABELS, isImageType, isTranscribableType } from '@/lib/upload/file-types'
import type { Document, DocumentStatus } from '@/lib/db/types'

export type ClassroomDocRow = {
  id: string
  filename: string
  file_type: string
  file_size_bytes: number
  status: string
  chunk_count?: number | null
  error_message?: string | null
  created_at: string
}

function toDocumentShape(row: ClassroomDocRow): Document {
  return {
    id: row.id,
    user_id: '',
    filename: row.filename,
    file_type: row.file_type,
    r2_key: '',
    file_size_bytes: row.file_size_bytes ?? 0,
    chunk_count: row.chunk_count ?? null,
    status: (row.status as DocumentStatus) || 'done',
    error_message: row.error_message ?? null,
    note_content: null,
    description: null,
    content_hash: null,
    extracted_content: null,
    ocr_text: null,
    folder_id: null,
    deleted_at: null,
    created_at: row.created_at,
    tags: [],
  }
}

type Tab = 'content' | 'subtitles' | 'details'

export function ClassroomDocumentPreview({
  open,
  classroomId,
  doc,
  role,
  onClose,
  onDeleted,
  onRequestDelete,
}: {
  open: boolean
  classroomId: string
  doc: ClassroomDocRow | null
  role: 'teacher' | 'student'
  onClose: () => void
  onDeleted?: () => void
  /** When set, parent handles confirm + delete (preferred). */
  onRequestDelete?: () => void
}) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [tab, setTab] = useState<Tab>('content')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPreview = useCallback(async (documentId: string) => {
    setPreviewLoading(true)
    setPreview(null)
    setError(null)
    const res = await fetch(`/api/classroom/${classroomId}/documents/${documentId}/preview`)
    if (res.ok) {
      const data = (await res.json()) as PreviewData
      setPreview(data)
      setEditContent(data.content ?? '')
    } else {
      setError('Không mở được tài liệu')
    }
    setPreviewLoading(false)
  }, [classroomId])

  useEffect(() => {
    if (!open || !doc) return
    setTab('content')
    void loadPreview(doc.id)
  }, [open, doc, loadPreview])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleDelete() {
    if (!doc || role !== 'teacher' || deleting) return
    if (onRequestDelete) {
      onRequestDelete()
      return
    }
    setDeleting(true)
    const res = await fetch(`/api/classroom/${classroomId}/documents/${doc.id}`, {
      method: 'DELETE',
    })
    setDeleting(false)
    if (!res.ok) {
      setError('Không xóa được tài liệu')
      return
    }
    onDeleted?.()
    onClose()
  }

  if (!open || !doc) return null

  const mapped = toDocumentShape(doc)
  const viewerUrl = `/api/classroom/${classroomId}/documents/${doc.id}`
  const isMedia = isTranscribableType(doc.file_type)
  const showOcr = isImageType(doc.file_type)

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        'flex-1 px-2.5 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap',
        tab === id
          ? 'border-b-2 border-primary font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-4xl lg:max-w-5xl h-[min(92vh,900px)] rounded-xl border bg-background shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={doc.filename}
      >
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b">
          <p className="text-sm font-medium truncate flex-1 min-w-0">{doc.filename}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="shrink-0 flex border-b overflow-x-auto">
          {tabBtn('content', 'Nội dung')}
          {isMedia && tabBtn('subtitles', 'Phụ đề')}
          {tabBtn('details', 'Chi tiết')}
        </div>

        {error && (
          <div className="shrink-0 border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div
            className={cn(
              'flex-1 min-h-0 flex flex-col overflow-hidden',
              tab !== 'content' && 'hidden'
            )}
          >
            <ContentPreview
              doc={mapped}
              preview={preview}
              previewLoading={previewLoading}
              editContent={editContent}
              isActive={tab === 'content'}
              onEditContent={setEditContent}
              readOnly
            />
            <ContentPreviewFooter
              doc={mapped}
              preview={preview}
              editContent={editContent}
              savingContent={false}
              onSaveContent={() => {}}
              viewerUrl={viewerUrl}
              canInline={Boolean(preview?.can_inline)}
              canOpenDownload
              readOnly
            />
          </div>

          {isMedia && (
            <div
              className={cn(
                'flex-1 min-h-0 flex flex-col overflow-hidden',
                tab !== 'subtitles' && 'hidden'
              )}
            >
              <SubtitlesPanel
                preview={preview}
                previewLoading={previewLoading}
                status={mapped.status}
              />
            </div>
          )}

          <div
            className={cn('flex-1 min-h-0 overflow-y-auto', tab !== 'details' && 'hidden')}
          >
            <div className="p-4 space-y-3">
              <div className="flex justify-center py-2">
                <FileIcon type={doc.file_type} />
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p>Loại: {TYPE_LABELS[doc.file_type] ?? doc.file_type}</p>
                <p>Kích thước: {formatBytes(doc.file_size_bytes ?? 0)}</p>
                {doc.chunk_count != null && <p>Chunks: {doc.chunk_count}</p>}
                <p>Ngày tạo: {new Date(doc.created_at).toLocaleDateString('vi-VN')}</p>
                <StatusBadge status={mapped.status} />
              </div>

              {showOcr && (
                <OcrDetailsSection
                  doc={mapped}
                  preview={preview}
                  editContent={editContent}
                  savingContent={false}
                  onEditContent={setEditContent}
                  onSaveContent={() => {}}
                  readOnly
                />
              )}

              <div className="flex flex-col gap-2 pt-2">
                <a
                  href={`${viewerUrl}?download=1`}
                  className={cn(
                    'inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted'
                  )}
                >
                  Tải về
                </a>
                {role === 'teacher' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                  >
                    {deleting ? 'Đang xóa...' : 'Xóa'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
