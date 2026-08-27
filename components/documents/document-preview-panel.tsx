'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download, ExternalLink, Pencil, Upload, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/documents/document-grid'
import { DocumentTagEditor } from '@/components/documents/tag-manager'
import type { PreviewData } from '@/components/documents/types'
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

export type DocumentPanelTab = PanelTab

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
  selectedTagIds: string[]
  savingTags: boolean
  onClose: () => void
  onEditName: (v: string) => void
  onEditDescription: (v: string) => void
  onEditContent: (v: string) => void
  onSaveName: () => void | Promise<void | boolean>
  onSaveDescription: () => void | Promise<void | boolean>
  onSaveContent: () => void | Promise<void | boolean>
  onTagIdsChange: (ids: string[]) => void
  onSaveTags: () => void | Promise<void | boolean>
  onReprocessOcr?: () => void
  reprocessingOcr?: boolean
  onReupload?: () => void
  reuploading?: boolean
  onKeepWeakOcr?: () => void
  keepingWeakOcr?: boolean
  onDelete: () => void
  deleting?: boolean
}

function PreviewBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 min-h-0 overflow-hidden flex flex-col', className)}>
      {children}
    </div>
  )
}

function PreviewLoadingState({
  label = 'Đang tải...',
  compact = false,
}: {
  label?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-muted-foreground',
        compact ? 'p-6' : 'flex-1 min-h-[200px] p-8'
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
      {!compact && (
        <div className="w-full max-w-xs space-y-2 mt-1">
          <div className="h-3 w-full rounded bg-muted animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-muted animate-pulse mx-auto" />
        </div>
      )}
    </div>
  )
}

function AssetPreviewFrame({
  loading,
  loadingLabel,
  children,
  className,
}: {
  loading: boolean
  loadingLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('relative flex-1 min-h-0 flex flex-col', className)}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85">
          <PreviewLoadingState label={loadingLabel ?? 'Đang tải nội dung...'} compact />
        </div>
      )}
      {children}
    </div>
  )
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 5
const ZOOM_STEP = 0.25

function clampZoomScale(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100))
}

function ZoomableImage({
  src,
  alt,
  loading,
  onLoad,
  onError,
  maxHeightClass,
}: {
  src: string
  alt: string
  loading: boolean
  onLoad: () => void
  onError: () => void
  maxHeightClass: string
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    originX: number
    originY: number
  }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [src])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function onNativeWheel(e: WheelEvent) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      setScale((prev) => {
        const next = clampZoomScale(prev + delta)
        if (next === prev) return prev
        if (el) {
          const rect = el.getBoundingClientRect()
          const cx = e.clientX - rect.left - rect.width / 2
          const cy = e.clientY - rect.top - rect.height / 2
          const ratio = next / prev
          setOffset((o) => ({
            x: cx - (cx - o.x) * ratio,
            y: cy - (cy - o.y) * ratio,
          }))
        }
        if (next <= 1) setOffset({ x: 0, y: 0 })
        return next
      })
    }
    el.addEventListener('wheel', onNativeWheel, { passive: false })
    return () => el.removeEventListener('wheel', onNativeWheel)
  }, [])

  function zoomBy(delta: number) {
    setScale((prev) => {
      const next = clampZoomScale(prev + delta)
      if (next <= 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  function resetZoom() {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  function onPointerDown(e: React.PointerEvent) {
    if (scale <= 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.active) return
    setOffset({
      x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    dragRef.current.active = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function onDoubleClick() {
    if (scale > 1) {
      resetZoom()
      return
    }
    setScale(2)
  }

  return (
    <div className="relative flex flex-col min-h-0 flex-1 gap-2">
      <div
        ref={viewportRef}
        className={cn(
          'relative flex-1 min-h-[200px] overflow-hidden rounded border bg-muted/20 touch-none select-none',
          scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={onLoad}
          onError={onError}
          className={cn(
            'absolute left-1/2 top-1/2 object-contain bg-background will-change-transform transition-opacity duration-200',
            maxHeightClass,
            loading && 'opacity-0'
          )}
          style={{
            width: 'auto',
            maxWidth: scale <= 1 ? '100%' : 'none',
            height: 'auto',
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
      <div className="shrink-0 flex items-center justify-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={() => zoomBy(-ZOOM_STEP)}
          disabled={scale <= ZOOM_MIN}
          aria-label="Thu nhỏ"
          title="Thu nhỏ (hoặc lăn chuột)"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={scale >= ZOOM_MAX}
          aria-label="Phóng to"
          title="Phóng to (hoặc lăn chuột)"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={resetZoom}
          disabled={scale === 1 && offset.x === 0 && offset.y === 0}
          aria-label="Đặt lại zoom"
          title="Đặt lại 100%"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          100%
        </Button>
      </div>
    </div>
  )
}

export function getContentEditState(
  doc: Document,
  preview: PreviewData | null,
  editContent: string
) {
  const fileType = preview?.file_type ?? doc.file_type
  const isMediaType = isTranscribableType(fileType)
  const canEditText =
    !isMediaType &&
    (doc.file_type === 'note' ||
      ((preview?.preview_type === 'text' || preview?.preview_type === 'image_with_text') &&
        Boolean(preview?.content)))
  const originalContent = preview?.content ?? ''
  const hasContentChanges = editContent.trim() !== originalContent.trim()
  return { canEditText, hasContentChanges }
}

export function ContentPreviewFooter({
  doc,
  preview,
  editContent,
  savingContent,
  onSaveContent,
  viewerUrl,
  canInline,
  canOpenDownload,
}: {
  doc: Document
  preview: PreviewData | null
  editContent: string
  savingContent: boolean
  onSaveContent: () => void | Promise<void | boolean>
  viewerUrl: string
  canInline: boolean
  canOpenDownload: boolean
}) {
  const { canEditText, hasContentChanges } = getContentEditState(doc, preview, editContent)
  const showDownload = doc.file_type !== 'note' && canOpenDownload

  if (!canEditText && !showDownload) return null

  return (
    <div className="shrink-0 flex gap-2 p-3 border-t bg-background">
      {canEditText && (
        <Button
          size="default"
          onClick={() => void onSaveContent()}
          disabled={savingContent || !hasContentChanges}
          className="flex-1 gap-2"
        >
          {savingContent ? 'Đang lưu...' : 'Lưu'}
        </Button>
      )}
      {showDownload && canInline && (
        <a
          href={viewerUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'flex-1 gap-2')}
        >
          <ExternalLink className="h-4 w-4" />
          Mở tab mới
        </a>
      )}
      {showDownload && (
        <a
          href={`${viewerUrl}?download=1`}
          className={cn(buttonVariants({ variant: 'default', size: 'default' }), 'flex-1 gap-2')}
        >
          <Download className="h-4 w-4" />
          Tải về
        </a>
      )}
    </div>
  )
}

export function ContentPreview({
  doc,
  preview,
  previewLoading,
  editContent,
  isActive,
  onEditContent,
  pdfStartPage,
  layout = 'panel',
}: {
  doc: Document
  preview: PreviewData | null
  previewLoading: boolean
  editContent: string
  isActive: boolean
  onEditContent: (v: string) => void
  pdfStartPage?: number
  layout?: 'panel' | 'page'
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const [assetLoading, setAssetLoading] = useState(true)

  useEffect(() => {
    if (!isActive) mediaRef.current?.pause()
  }, [isActive])
  const baseViewerUrl =
    preview?.viewer_url ?? preview?.image_url ?? `/api/documents/${doc.id}/download`
  const fileType = preview?.file_type ?? doc.file_type
  const viewerUrl =
    fileType === 'pdf' && pdfStartPage
      ? `${baseViewerUrl}#page=${pdfStartPage}`
      : baseViewerUrl
  const isMedia = isTranscribableType(fileType)
  const canEditText =
    !isMedia &&
    (doc.file_type === 'note' ||
      ((preview?.preview_type === 'text' || preview?.preview_type === 'image_with_text') &&
        Boolean(preview?.content)))

  useEffect(() => {
    setAssetLoading(true)
  }, [doc.id, viewerUrl])

  if (previewLoading) {
    return (
      <PreviewBody>
        <PreviewLoadingState label="Đang mở tài liệu..." />
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
      <PreviewBody className={layout === 'page' ? 'min-h-[50vh]' : undefined}>
        <AssetPreviewFrame loading={assetLoading} loadingLabel="Đang tải PDF...">
          <iframe
            src={viewerUrl}
            title={preview?.filename ?? doc.filename}
            onLoad={() => setAssetLoading(false)}
            className={cn(
              'flex-1 w-full border-0 bg-background',
              layout === 'page' ? 'min-h-[50vh]' : 'min-h-[300px]',
              assetLoading && 'opacity-0'
            )}
          />
        </AssetPreviewFrame>
      </PreviewBody>
    )
  }

  if (isImageType(fileType)) {
    return (
      <PreviewBody className={layout === 'page' ? 'min-h-[40vh]' : undefined}>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 flex flex-col">
          <AssetPreviewFrame
            loading={assetLoading}
            loadingLabel="Đang tải ảnh..."
            className={cn(
              'min-h-[240px]',
              layout === 'page' ? 'min-h-[min(50vh,420px)]' : 'min-h-[min(40vh,320px)]'
            )}
          >
            <ZoomableImage
              src={preview?.image_url ?? viewerUrl}
              alt={preview?.filename ?? doc.filename}
              loading={assetLoading}
              onLoad={() => setAssetLoading(false)}
              onError={() => setAssetLoading(false)}
              maxHeightClass={
                layout === 'page' ? 'max-h-[min(70vh,720px)]' : 'max-h-[min(50vh,480px)]'
              }
            />
          </AssetPreviewFrame>
          {preview?.content &&
            (canEditText ? (
              <Textarea
                value={editContent}
                onChange={(e) => onEditContent(e.target.value)}
                rows={10}
                className="min-h-56 resize-y text-sm leading-relaxed"
              />
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
      <PreviewBody className={layout === 'page' ? 'min-h-[50vh]' : undefined}>
        <AssetPreviewFrame loading={assetLoading} loadingLabel="Đang tải video...">
          <div className="flex-1 min-h-0 flex items-center justify-center p-4">
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={viewerUrl}
              controls
              preload="metadata"
              onLoadedData={() => setAssetLoading(false)}
              onError={() => setAssetLoading(false)}
              className={cn(
                'w-full rounded border bg-black transition-opacity duration-200',
                layout === 'page' ? 'max-h-[min(70vh,720px)]' : 'max-h-full',
                assetLoading && 'opacity-0'
              )}
            />
          </div>
        </AssetPreviewFrame>
      </PreviewBody>
    )
  }

  if (fileType === 'mp3' || fileType === 'wav') {
    return (
      <PreviewBody>
        <AssetPreviewFrame loading={assetLoading} loadingLabel="Đang tải audio...">
          <div className="p-6 flex items-center justify-center">
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={viewerUrl}
              controls
              preload="metadata"
              onLoadedData={() => setAssetLoading(false)}
              onError={() => setAssetLoading(false)}
              className={cn('w-full transition-opacity duration-200', assetLoading && 'opacity-0')}
            />
          </div>
        </AssetPreviewFrame>
      </PreviewBody>
    )
  }

  if (preview?.content || doc.file_type === 'note') {
    return (
      <PreviewBody>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {canEditText ? (
            <Textarea
              value={editContent}
              onChange={(e) => onEditContent(e.target.value)}
              rows={18}
              className="min-h-[min(55vh,420px)] resize-y text-sm leading-relaxed"
            />
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

export function SubtitlesPanel({
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
        <PreviewLoadingState label="Đang tải phụ đề..." />
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

export function DescriptionPanel({
  editDescription,
  savingDescription,
  onEditDescription,
  onSaveDescription,
  allTags,
  selectedTagIds,
  savingTags,
  onTagIdsChange,
  onSaveTags,
}: {
  editDescription: string
  savingDescription: boolean
  onEditDescription: (v: string) => void
  onSaveDescription: () => void | Promise<void | boolean>
  allTags: Tag[]
  selectedTagIds: string[]
  savingTags: boolean
  onTagIdsChange: (ids: string[]) => void
  onSaveTags: () => void | Promise<void | boolean>
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <DocumentTagEditor
          allTags={allTags}
          selectedTagIds={selectedTagIds}
          saving={savingTags}
          onChange={onTagIdsChange}
          onSave={onSaveTags}
        />

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
  selectedTagIds,
  savingTags,
  onClose,
  onEditName,
  onEditDescription,
  onEditContent,
  onSaveName,
  onSaveDescription,
  onSaveContent,
  onTagIdsChange,
  onSaveTags,
  onReprocessOcr,
  reprocessingOcr,
  onReupload,
  reuploading,
  onKeepWeakOcr,
  keepingWeakOcr = false,
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
    <div className="w-full flex flex-col h-full min-h-0 bg-background">
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
        {tabBtn('description', 'Mô tả và tag')}
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
              disabled={keepingWeakOcr || deleting || reuploading}
            >
              {keepingWeakOcr ? 'Đang lưu...' : 'Giữ ảnh'}
            </Button>
            {onReupload && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={onReupload}
                disabled={keepingWeakOcr || deleting || reuploading}
              >
                {reuploading ? t('reuploading') : t('reuploadFile')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={onDelete}
              disabled={keepingWeakOcr || deleting || reuploading}
            >
              {deleting ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </div>
        </div>
      )}

      {doc.status === 'failed' && isImageType(doc.file_type) && onReupload && (
        <div className="shrink-0 border-b bg-destructive/5 px-4 py-3 space-y-2">
          <p className="text-xs text-destructive leading-relaxed">
            {preview?.message ??
              doc.error_message ??
              'Xử lý ảnh thất bại. Bạn có thể tải file khác lên thay thế.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={onReupload}
            disabled={reuploading}
          >
            <Upload className="mr-2 h-4 w-4" />
            {reuploading ? t('reuploading') : t('reuploadFile')}
          </Button>
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
            isActive={tab === 'content'}
            onEditContent={onEditContent}
          />
          <ContentPreviewFooter
            doc={doc}
            preview={preview}
            editContent={editContent}
            savingContent={savingContent}
            onSaveContent={onSaveContent}
            viewerUrl={viewerUrl}
            canInline={canInline}
            canOpenDownload={canOpenDownload}
          />
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
            allTags={allTags}
            selectedTagIds={selectedTagIds}
            savingTags={savingTags}
            onTagIdsChange={onTagIdsChange}
            onSaveTags={onSaveTags}
          />
        </div>

        <div className={cn('flex-1 min-h-0 overflow-y-auto', tab !== 'details' && 'hidden')}>
          <div className="p-4 space-y-3">
            <div className="flex justify-center py-2">{fileIcon}</div>

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
