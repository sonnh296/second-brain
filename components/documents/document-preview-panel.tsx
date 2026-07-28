'use client'

import { useState } from 'react'
import { Download, ExternalLink, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge, STATUS_LABELS } from '@/components/documents/document-grid'
import { DocumentTagEditor } from '@/components/documents/tag-manager'
import { FolderPicker } from '@/components/documents/folder-items'
import { cn } from '@/lib/utils'
import { isBrowserInlineType, isImageType } from '@/lib/upload/file-types'
import type { Document, Tag } from '@/lib/db/types'

type DocStatus = Document['status']
type PanelTab = 'content' | 'details'

interface PreviewData {
  filename: string
  file_type: string
  status: string
  content: string | null
  preview_type: string
  message?: string
  image_url?: string
  viewer_url?: string
  can_inline?: boolean
  download_url?: string
}

interface DocumentPreviewPanelProps {
  doc: Document
  preview: PreviewData | null
  previewLoading: boolean
  editName: string
  editDescription: string
  savingMeta: boolean
  typeLabels: Record<string, string>
  fileIcon: React.ReactNode
  formatBytes: (bytes: number) => string
  allTags: Tag[]
  allFolders: { id: string; name: string; parent_id: string | null }[]
  selectedTagIds: string[]
  selectedFolderId: string | null
  savingTags: boolean
  savingFolder: boolean
  onClose: () => void
  onEditName: (v: string) => void
  onEditDescription: (v: string) => void
  onSaveMetadata: () => void
  onTagIdsChange: (ids: string[]) => void
  onSaveTags: () => void
  onFolderChange: (folderId: string | null) => void
  onSaveFolder: () => void
  onReprocessOcr?: () => void
  reprocessingOcr?: boolean
  onEditNote?: () => void
  onDelete: () => void
}

function PreviewBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 min-h-[280px] overflow-hidden flex flex-col', className)}>
      {children}
    </div>
  )
}

function ContentPreview({
  doc,
  preview,
  previewLoading,
}: {
  doc: Document
  preview: PreviewData | null
  previewLoading: boolean
}) {
  const viewerUrl = preview?.viewer_url ?? preview?.image_url ?? `/api/documents/${doc.id}/download`
  const fileType = preview?.file_type ?? doc.file_type

  if (previewLoading) {
    return (
      <PreviewBody>
        <p className="text-sm text-muted-foreground p-4">Đang tải...</p>
      </PreviewBody>
    )
  }

  if (doc.status !== 'done' && doc.file_type !== 'note') {
    return (
      <PreviewBody>
        <div className="p-4 text-sm text-muted-foreground">
          <p>{preview?.message ?? 'Tài liệu đang xử lý...'}</p>
        </div>
      </PreviewBody>
    )
  }

  if (fileType === 'pdf') {
    return (
      <PreviewBody>
        <iframe
          src={viewerUrl}
          title={preview?.filename ?? doc.filename}
          className="flex-1 w-full min-h-[300px] border-0 bg-background"
        />
      </PreviewBody>
    )
  }

  if (isImageType(fileType)) {
    return (
      <PreviewBody>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview?.image_url ?? viewerUrl}
            alt={preview?.filename ?? doc.filename}
            className="w-full max-h-[min(50vh,420px)] rounded border object-contain bg-background mx-auto"
          />
          {preview?.content && (
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed rounded border bg-background p-3">
              {preview.content}
            </pre>
          )}
          {preview?.message && (
            <p className="text-xs text-muted-foreground">{preview.message}</p>
          )}
        </div>
      </PreviewBody>
    )
  }

  if (['mp4', 'mov'].includes(fileType)) {
    return (
      <PreviewBody>
        <div className="flex-1 min-h-0 p-4 flex items-center justify-center">
          <video
            src={viewerUrl}
            controls
            className="w-full max-h-full rounded border bg-black"
          />
        </div>
      </PreviewBody>
    )
  }

  if (['mp3', 'wav'].includes(fileType)) {
    return (
      <PreviewBody>
        <div className="p-6 flex items-center justify-center">
          <audio src={viewerUrl} controls className="w-full" />
        </div>
      </PreviewBody>
    )
  }

  if (preview?.content || doc.file_type === 'note') {
    return (
      <PreviewBody>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed rounded border bg-background p-3">
            {preview?.content ?? ''}
          </pre>
        </div>
      </PreviewBody>
    )
  }

  return (
    <PreviewBody>
      <div className="p-4 text-sm text-muted-foreground">
        <p>{preview?.message ?? 'Không có nội dung văn bản để xem trước'}</p>
      </div>
    </PreviewBody>
  )
}

export function DocumentPreviewPanel({
  doc,
  preview,
  previewLoading,
  editName,
  editDescription,
  savingMeta,
  typeLabels,
  fileIcon,
  formatBytes,
  allTags,
  allFolders,
  selectedTagIds,
  selectedFolderId,
  savingTags,
  savingFolder,
  onClose,
  onEditName,
  onEditDescription,
  onSaveMetadata,
  onTagIdsChange,
  onSaveTags,
  onFolderChange,
  onSaveFolder,
  onReprocessOcr,
  reprocessingOcr,
  onEditNote,
  onDelete,
}: DocumentPreviewPanelProps) {
  const [tab, setTab] = useState<PanelTab>('content')
  const viewerUrl = `/api/documents/${doc.id}/download`
  const canInline = isBrowserInlineType(doc.file_type)

  return (
    <div className="w-full sm:w-[min(100vw-2rem,28rem)] lg:w-lg shrink-0 flex flex-col h-full min-h-0 bg-muted/10 border-l sm:border-l border-0">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b gap-2">
        <p className="text-sm font-medium truncate flex-1">{doc.filename}</p>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 flex border-b">
        <button
          type="button"
          onClick={() => setTab('content')}
          className={cn(
            'flex-1 px-4 py-2 text-sm transition-colors cursor-pointer',
            tab === 'content'
              ? 'border-b-2 border-primary font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Nội dung
        </button>
        <button
          type="button"
          onClick={() => setTab('details')}
          className={cn(
            'flex-1 px-4 py-2 text-sm transition-colors cursor-pointer',
            tab === 'details'
              ? 'border-b-2 border-primary font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Chi tiết
        </button>
      </div>

      {tab === 'content' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <ContentPreview doc={doc} preview={preview} previewLoading={previewLoading} />
          {doc.file_type !== 'note' && doc.status === 'done' && (
            <div className="shrink-0 flex gap-2 p-3 border-t bg-muted/50 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
              {canInline && (
                <a
                  href={viewerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'default' }),
                    'flex-1 gap-2 shadow-sm'
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  Mở tab mới
                </a>
              )}
              <a
                href={`${viewerUrl}?download=1`}
                className={cn(
                  buttonVariants({ variant: 'default', size: 'default' }),
                  canInline ? 'flex-1' : 'w-full',
                  'gap-2 shadow-sm'
                )}
              >
                <Download className="h-4 w-4" />
                Tải về
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-3">
            <div className="flex justify-center py-2">{fileIcon}</div>
            <div>
              <Label className="text-xs text-muted-foreground">Tên</Label>
              <Input
                value={editName}
                onChange={(e) => onEditName(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Mô tả</Label>
              <Input
                value={editDescription}
                onChange={(e) => onEditDescription(e.target.value)}
                placeholder="Mô tả ngắn..."
                className="mt-1 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onSaveMetadata}
              disabled={savingMeta}
            >
              {savingMeta ? 'Đang lưu...' : 'Lưu tên & mô tả'}
            </Button>

            <DocumentTagEditor
              allTags={allTags}
              selectedTagIds={selectedTagIds}
              saving={savingTags}
              onChange={onTagIdsChange}
              onSave={onSaveTags}
            />

            <div className="space-y-2">
              <FolderPicker
                folders={allFolders.map((f) => ({
                  id: f.id,
                  user_id: '',
                  parent_id: f.parent_id,
                  name: f.name,
                  color: '#f59e0b',
                  created_at: '',
                  updated_at: '',
                }))}
                value={selectedFolderId}
                onChange={onFolderChange}
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={onSaveFolder}
                disabled={savingFolder}
              >
                {savingFolder ? 'Đang lưu...' : 'Di chuyển thư mục'}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <p>Loại: {typeLabels[doc.file_type] ?? doc.file_type}</p>
              <p>Kích thước: {formatBytes(doc.file_size_bytes)}</p>
              {doc.chunk_count != null && <p>Chunks: {doc.chunk_count}</p>}
              <p>Ngày tạo: {new Date(doc.created_at).toLocaleDateString('vi-VN')}</p>
              <StatusBadge status={doc.status} />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {onReprocessOcr && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReprocessOcr}
                  disabled={reprocessingOcr}
                >
                  {reprocessingOcr ? 'Đang quét lại...' : 'Quét lại OCR'}
                </Button>
              )}
              {onEditNote && (
                <Button variant="outline" size="sm" onClick={onEditNote}>
                  Sửa nội dung
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Xóa
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { STATUS_LABELS }
