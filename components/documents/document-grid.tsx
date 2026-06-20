'use client'

import { useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Document } from '@/lib/db/types'

type DocStatus = Document['status']

const STATUS_LABELS: Record<DocStatus, string> = {
  done: 'Sẵn sàng',
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  failed: 'Lỗi',
}

function StatusBadge({ status }: { status: DocStatus }) {
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

export function DriveGridItem({
  doc,
  selected,
  onOpen,
  onEdit,
  onDelete,
  fileIcon,
}: {
  doc: Document
  selected: boolean
  onOpen: () => void
  onEdit?: () => void
  onDelete: () => void
  fileIcon: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      className={`group relative rounded-xl border bg-card p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${
        selected ? 'ring-2 ring-primary border-primary/50' : ''
      }`}
      onClick={onOpen}
    >
      <div className="flex flex-col items-center text-center gap-2">
        {fileIcon}
        <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{doc.filename}</p>
        {doc.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-1 w-full">{doc.description}</p>
        )}
        <StatusBadge status={doc.status} />
      </div>
      <button
        type="button"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted"
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
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
              onClick={onEdit}
            >
              Sửa
            </button>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-muted"
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
  onOpen,
  onEdit,
  onDelete,
  fileIcon,
  formatBytes,
}: {
  doc: Document
  selected: boolean
  onOpen: () => void
  onEdit?: () => void
  onDelete: () => void
  fileIcon: React.ReactNode
  formatBytes: (bytes: number) => string
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50 ${
        selected ? 'bg-primary/5 border-primary/40' : 'bg-card'
      }`}
      onClick={onOpen}
    >
      {fileIcon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.filename}</p>
        {doc.description && (
          <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
        {formatBytes(doc.file_size_bytes)}
      </span>
      <span className="text-xs text-muted-foreground shrink-0 hidden md:block">
        {new Date(doc.created_at).toLocaleDateString('vi-VN')}
      </span>
      <StatusBadge status={doc.status} />
      {onEdit && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          Sửa
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-destructive shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        Xóa
      </Button>
    </div>
  )
}

export { StatusBadge, STATUS_LABELS }
