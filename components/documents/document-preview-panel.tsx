'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download, ExternalLink, Pencil, Upload, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/documents/document-grid'
import { DocumentTagEditor } from '@/components/documents/tag-manager'
import { FolderPicker } from '@/components/documents/folder-items'
import { cn } from '@/lib/utils'
import {
  isBrowserInlineType,
  isImageType,
  isTranscribableType,
  MAX_DOCUMENT_DESCRIPTION_LENGTH,
} from '@/lib/upload/file-types'
import { isOcrWeakContentWarning } from '@/lib/ingestion/ocr-status'
import type { Document, Tag } from '@/lib/db/types'

type PanelTab = 'content' | 'subtitles' | 'description' | 'details'

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
  editContent: string
  savingName: boolean
  savingDescription: boolean
  savingContent: boolean
  saveError?: string
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
  onEditContent: (v: string) => void
  onSaveName: () => void | Promise<void>
  onSaveDescription: () => void | Promise<void>
  onSaveContent: () => void | Promise<void>
  onTagIdsChange: (ids: string[]) => void
  onSaveTags: () => void
  onFolderChange: (folderId: string | null) => void
  onSaveFolder: () => void
  onReprocessOcr?: () => void
  reprocessingOcr?: boolean
  onReupload?: () => void
  reuploading?: boolean
  onKeepWeakOcr?: () => void
  keepingWeakOcr?: boolean
  onEditNote?: () => void
  onDelete: () => void
  deleting?: boolean
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
  editContent,
  savingContent,
  isActive,
  onEditContent,
  onSaveContent,
}: {
  doc: Document
  preview: PreviewData | null
  previewLoading: boolean
  editContent: string
  savingContent: boolean
  isActive: boolean
  onEditContent: (v: string) => void
  onSaveContent: () => void | Promise<void>
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!isActive) mediaRef.current?.pause()
  }, [isActive])
  const viewerUrl = preview?.viewer_url ?? preview?.image_url ?? `/api/documents/${doc.id}/download`
  const fileType = preview?.file_type ?? doc.file_type
  const isMedia = isTranscribableType(fileType)
  const canEditText =
    !isMedia &&
    (doc.file_type === 'note' ||
      ((preview?.preview_type === 'text' || preview?.preview_type === 'image_with_text') &&
        Boolean(preview?.content)))
  const originalContent = preview?.content ?? ''
  const hasContentChanges = editContent.trim() !== originalContent.trim()

  if (previewLoading) {
    return (
      <PreviewBody>
        <p className="text-sm text-muted-foreground p-4">Đang tải...</p>
      </PreviewBody>
    )
  }

  // Media/images can be viewed while processing, or after a soft OCR warning / hard fail.
  if (
    doc.status !== 'done' &&
    doc.file_type !== 'note' &&
    !isMedia &&
    !isImageType(doc.file_type)
  ) {
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
          {preview?.content &&
            (canEditText ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => onEditContent(e.target.value)}
                  rows={10}
                  className="min-h-56 resize-y text-sm leading-relaxed"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onSaveContent()}
                  disabled={savingContent || !hasContentChanges}
                >
                  {savingContent ? 'Đang lưu nội dung...' : 'Lưu nội dung đã chỉnh sửa'}
                </Button>
              </div>
            ) : (
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed rounded border bg-background p-3">
                {preview.content}
              </pre>
            ))}
          {preview?.message && (
            <p className="text-xs text-muted-foreground">{preview.message}</p>
          )}
        </div>
      </PreviewBody>
    )
  }

  if (fileType === 'mp4' || fileType === 'mov') {
    return (
      <PreviewBody>
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={viewerUrl}
            controls
            className="w-full max-h-full rounded border bg-black"
          />
        </div>
      </PreviewBody>
    )
  }

  if (fileType === 'mp3' || fileType === 'wav') {
    return (
      <PreviewBody>
        <div className="p-6 flex items-center justify-center">
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={viewerUrl}
            controls
            className="w-full"
          />
        </div>
      </PreviewBody>
    )
  }

  if (preview?.content || doc.file_type === 'note') {
    return (
      <PreviewBody>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {canEditText ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => onEditContent(e.target.value)}
                rows={18}
                className="min-h-[min(55vh,420px)] resize-y text-sm leading-relaxed"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void onSaveContent()}
                disabled={savingContent || !hasContentChanges}
              >
                {savingContent ? 'Đang lưu nội dung...' : 'Lưu nội dung đã chỉnh sửa'}
              </Button>
            </div>
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed rounded border bg-background p-3">
              {preview?.content ?? ''}
            </pre>
          )}
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

function SubtitlesPanel({
  preview,
  previewLoading,
  status,
}: {
  preview: PreviewData | null
  previewLoading: boolean
  status: Document['status']
}) {
  if (previewLoading) {
    return (
      <PreviewBody>
        <p className="text-sm text-muted-foreground p-4">Đang tải...</p>
      </PreviewBody>
    )
  }

  const processing = status === 'pending' || status === 'processing'
  const transcript = preview?.content?.trim() || null

  if (processing && !transcript) {
    return (
      <PreviewBody>
        <div className="p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Đang tạo phụ đề lần đầu...</p>
          <p>Chỉ tạo một lần khi upload. Xong sẽ lưu vào hệ thống — mở lại không tạo lại.</p>
        </div>
      </PreviewBody>
    )
  }

  if (transcript) {
    return (
      <PreviewBody>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Bản phụ đề</p>
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed rounded border bg-background p-3">
            {transcript}
          </pre>
        </div>
      </PreviewBody>
    )
  }

  return (
    <PreviewBody>
      <div className="p-4 text-sm text-muted-foreground">
        <p>
          {status === 'failed'
            ? preview?.message ?? 'Tạo phụ đề thất bại'
            : preview?.message ?? 'Không có phụ đề cho video này'}
        </p>
      </div>
    </PreviewBody>
  )
}

function DescriptionPanel({
  editDescription,
  savingDescription,
  onEditDescription,
  onSaveDescription,
}: {
  editDescription: string
  savingDescription: boolean
  onEditDescription: (v: string) => void
  onSaveDescription: () => void
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Mô tả tài liệu</Label>
          <Textarea
            value={editDescription}
            onChange={(e) => onEditDescription(e.target.value)}
            placeholder="Ghi chú, tóm tắt hoặc mô tả chi tiết để dễ tìm lại sau..."
            rows={14}
            maxLength={MAX_DOCUMENT_DESCRIPTION_LENGTH}
            className="mt-1.5 min-h-[min(50vh,320px)] resize-y text-sm leading-relaxed"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {editDescription.length.toLocaleString('vi-VN')} /{' '}
            {MAX_DOCUMENT_DESCRIPTION_LENGTH.toLocaleString('vi-VN')} ký tự
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onSaveDescription}
          disabled={savingDescription}
        >
          {savingDescription ? 'Đang lưu...' : 'Lưu mô tả'}
        </Button>
      </div>
    </div>
  )
}

export function DocumentPreviewPanel({
  doc,
  preview,
  previewLoading,
  editName,
  editDescription,
  editContent,
  savingName,
  savingDescription,
  savingContent,
  saveError,
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
  onEditContent,
  onSaveName,
  onSaveDescription,
  onSaveContent,
  onTagIdsChange,
  onSaveTags,
  onFolderChange,
  onSaveFolder,
  onReprocessOcr,
  reprocessingOcr,
  onReupload,
  reuploading,
  onKeepWeakOcr,
  keepingWeakOcr = false,
  onEditNote,
  onDelete,
  deleting = false,
}: DocumentPreviewPanelProps) {
  const t = useTranslations('documents')
  const [tab, setTab] = useState<PanelTab>('content')
  const [editingName, setEditingName] = useState(false)
  const viewerUrl = `/api/documents/${doc.id}/download`
  const canInline = isBrowserInlineType(doc.file_type)
  const isMedia = isTranscribableType(doc.file_type)
  const canOpenDownload =
    doc.file_type === 'note' ||
    doc.status === 'done' ||
    isMedia ||
    isImageType(doc.file_type)
  const showWeakOcrPrompt =
    Boolean(onKeepWeakOcr) && isOcrWeakContentWarning(doc.error_message) && doc.status === 'done'

  useEffect(() => {
    setEditingName(false)
    setTab('content')
  }, [doc.id])

  function cancelNameEdit() {
    onEditName(doc.filename)
    setEditingName(false)
  }

  async function commitNameEdit() {
    await onSaveName()
    setEditingName(false)
  }

  const tabBtn = (id: PanelTab, label: string) => (
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
    <div className="w-full sm:w-[min(100vw-2rem,28rem)] lg:w-lg shrink-0 flex flex-col h-full min-h-0 bg-muted/10 border-l sm:border-l border-0">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Input
                value={editName}
                onChange={(e) => onEditName(e.target.value)}
                className="h-8 text-sm flex-1 min-w-0"
                autoFocus
                disabled={savingName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitNameEdit()
                  if (e.key === 'Escape') cancelNameEdit()
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 px-2.5"
                onClick={() => void commitNameEdit()}
                disabled={savingName || !editName.trim()}
              >
                {savingName ? '...' : 'Lưu'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 px-2"
                onClick={cancelNameEdit}
                disabled={savingName}
              >
                Hủy
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium truncate flex-1 min-w-0">{doc.filename}</p>
              <button
                type="button"
                className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                title="Sửa tên"
                aria-label="Sửa tên"
                onClick={() => {
                  onEditName(doc.filename)
                  setEditingName(true)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 flex border-b overflow-x-auto">
        {tabBtn('content', 'Nội dung')}
        {isMedia && tabBtn('subtitles', 'Phụ đề')}
        {tabBtn('description', 'Mô tả')}
        {tabBtn('details', 'Chi tiết')}
      </div>
      {saveError && (
        <div className="shrink-0 border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}
      {showWeakOcrPrompt && (
        <div className="shrink-0 border-b bg-amber-500/10 px-4 py-3 space-y-2">
          <p className="text-xs text-amber-950 dark:text-amber-100 leading-relaxed">
            Nội dung OCR quá ngắn hoặc không rõ nghĩa. Ảnh vẫn xem và dùng bình thường được — bạn
            muốn giữ không?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={onKeepWeakOcr}
              disabled={keepingWeakOcr || deleting}
            >
              {keepingWeakOcr ? 'Đang lưu...' : 'Giữ ảnh'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={onDelete}
              disabled={keepingWeakOcr || deleting}
            >
              {deleting ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </div>
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
            doc={doc}
            preview={preview}
            previewLoading={previewLoading}
            editContent={editContent}
            savingContent={savingContent}
            isActive={tab === 'content'}
            onEditContent={onEditContent}
            onSaveContent={onSaveContent}
          />
          {doc.file_type !== 'note' && canOpenDownload && (
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

        {isMedia && (
          <div
            className={cn(
              'flex-1 min-h-0 flex flex-col overflow-hidden',
              tab !== 'subtitles' && 'hidden'
            )}
          >
            <SubtitlesPanel preview={preview} previewLoading={previewLoading} status={doc.status} />
          </div>
        )}

        <div className={cn('flex-1 min-h-0 flex flex-col overflow-hidden', tab !== 'description' && 'hidden')}>
          <DescriptionPanel
            editDescription={editDescription}
            savingDescription={savingDescription}
            onEditDescription={onEditDescription}
            onSaveDescription={onSaveDescription}
          />
        </div>

        <div className={cn('flex-1 min-h-0 overflow-y-auto', tab !== 'details' && 'hidden')}>
          <div className="p-4 space-y-3">
            <div className="flex justify-center py-2">{fileIcon}</div>

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
              {onReupload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReupload}
                  disabled={reuploading}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {reuploading ? t('reuploading') : t('reuploadFile')}
                </Button>
              )}
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
              <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
                {deleting ? 'Đang xóa...' : 'Xóa'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
