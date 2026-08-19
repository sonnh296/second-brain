'use client'

import { useState } from 'react'
import { MoreVertical, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TagBadge } from '@/components/documents/tag-manager'
import { isImageType } from '@/lib/upload/file-types'
import { useLongPressSelect } from '@/hooks/use-long-press-select'
import type { Document } from '@/lib/db/types'

type DocStatus = Document['status']

const STATUS_LABELS: Record<DocStatus, string> = {
  done: 'Sẵn sàng',
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  failed: 'Lỗi',
}

export function StatusBadge({ status }: { status: DocStatus }) {
  const variants: Record<DocStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    done: 'default',
    pending: 'secondary',
    processing: 'secondary',
    failed: 'destructive',
  }
  return (
    <Badge variant={variants[status]} className="text-[10px]">
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function ItemBusyOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-background/85 backdrop-blur-[1px]"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-1.5 px-2">
        <div
          className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin"
          aria-hidden
        />
        <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
      </div>
    </div>
  )
}

function FavoriteButton({
  favorited,
  onToggle,
}: {
  favorited: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="p-1 rounded hover:bg-muted cursor-pointer"
      title={favorited ? 'Bỏ yêu thích' : 'Yêu thích'}
      aria-label={favorited ? 'Bỏ yêu thích' : 'Yêu thích'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <Star
        className={`h-3.5 w-3.5 ${
          favorited ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'
        }`}
      />
    </button>
  )
}

export function DocumentThumb({
  doc,
  fallback,
  className,
}: {
  doc: Document
  fallback: React.ReactNode
  className: string
}) {
  const [failed, setFailed] = useState(false)
  const showThumb =
    isImageType(doc.file_type) &&
    doc.status !== 'pending' &&
    doc.status !== 'processing' &&
    !failed

  if (!showThumb) return fallback

  return (
    <img
      src={`/api/documents/${doc.id}/download?thumb=1`}
      alt=""
      draggable={false}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function DriveGridItem({
  doc,
  selected,
  selectionMode,
  onOpen,
  onSelect,
  onEdit,
  onDelete,
  onToggleFavorite,
  onDragStart,
  onDragEnd,
  fileIcon,
  busy,
  busyLabel = 'Đang xóa...',
}: {
  doc: Document
  selected: boolean
  selectionMode?: boolean
  onOpen: () => void
  onSelect?: (docId: string) => void
  onEdit?: () => void
  onDelete: () => void
  onToggleFavorite?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  fileIcon: React.ReactNode
  busy?: boolean
  busyLabel?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const press = useLongPressSelect({
    disabled: busy || !onSelect,
    onLongPress: () => onSelect?.(doc.id),
    onTap: () => {
      if (selectionMode) {
        onSelect?.(doc.id)
      } else {
        onOpen()
      }
    },
  })

  return (
    <div
      data-selectable
      className={`group relative rounded-xl border bg-card p-3 cursor-pointer select-none transition-all hover:shadow-md hover:border-primary/30 ${
        selected ? 'ring-2 ring-primary border-primary/50' : ''
      } ${busy ? 'pointer-events-none opacity-90' : ''}`}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={press.onClick}
      onDoubleClick={() => {
        if (!selectionMode) onOpen()
      }}
    >
      {busy && <ItemBusyOverlay label={busyLabel} />}
      {onToggleFavorite && (
        <div className="absolute top-2 left-2 z-10">
          <FavoriteButton favorited={Boolean(doc.is_favorite)} onToggle={onToggleFavorite} />
        </div>
      )}
      <div className="flex flex-col items-center text-center gap-2">
        <DocumentThumb
          doc={doc}
          fallback={fileIcon}
          className="h-24 w-full rounded-md border bg-muted/40 object-cover"
        />
        <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{doc.filename}</p>
        {doc.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-1 w-full">{doc.description}</p>
        )}
        {doc.tags && doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center w-full">
            {doc.tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
            {doc.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{doc.tags.length - 3}</span>
            )}
          </div>
        )}
        {doc.status !== 'done' && <StatusBadge status={doc.status} />}
      </div>
      <button
        type="button"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen(!menuOpen)
        }}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {menuOpen && (
        <div
          className="absolute top-8 right-2 z-10 bg-popover border rounded-md shadow-md py-1 min-w-[100px]"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted cursor-pointer"
              onClick={onEdit}
            >
              Sửa
            </button>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-muted cursor-pointer"
            onClick={onDelete}
          >
            Xóa
          </button>
        </div>
      )}
    </div>
  )
}

export function DriveListItem({
  doc,
  selected,
  selectionMode,
  onOpen,
  onSelect,
  onEdit,
  onDelete,
  onToggleFavorite,
  onDragStart,
  onDragEnd,
  fileIcon,
  formatBytes,
  busy,
  busyLabel = 'Đang xóa...',
}: {
  doc: Document
  selected: boolean
  selectionMode?: boolean
  onOpen: () => void
  onSelect?: (docId: string) => void
  onEdit?: () => void
  onDelete: () => void
  onToggleFavorite?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  fileIcon: React.ReactNode
  formatBytes: (bytes: number) => string
  busy?: boolean
  busyLabel?: string
}) {
  const press = useLongPressSelect({
    disabled: busy || !onSelect,
    onLongPress: () => onSelect?.(doc.id),
    onTap: () => {
      if (selectionMode) {
        onSelect?.(doc.id)
      } else {
        onOpen()
      }
    },
  })

  return (
    <div
      data-selectable
      className={`relative flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors hover:bg-muted/50 ${
        selected ? 'bg-primary/5 border-primary/40' : 'bg-card'
      } ${busy ? 'pointer-events-none opacity-90' : ''}`}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={press.onClick}
      onDoubleClick={() => {
        if (!selectionMode) onOpen()
      }}
    >
      {busy && <ItemBusyOverlay label={busyLabel} />}
      {onToggleFavorite && (
        <FavoriteButton favorited={Boolean(doc.is_favorite)} onToggle={onToggleFavorite} />
      )}
      <DocumentThumb
        doc={doc}
        fallback={fileIcon}
        className="h-10 w-10 shrink-0 rounded-md border bg-muted/40 object-cover"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.filename}</p>
        {doc.description && (
          <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
        )}
        {doc.tags && doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {doc.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
        {formatBytes(doc.file_size_bytes)}
      </span>
      <span className="text-xs text-muted-foreground shrink-0 hidden md:block">
        {new Date(doc.created_at).toLocaleDateString('vi-VN')}
      </span>
      {doc.status !== 'done' && <StatusBadge status={doc.status} />}
      <div className="flex items-center gap-1 shrink-0">
        {onEdit && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            Sửa
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          Xóa
        </Button>
      </div>
    </div>
  )
}
