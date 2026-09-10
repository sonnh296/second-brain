'use client'

import { useState } from 'react'
import { MoreVertical, Plus } from 'lucide-react'
import { StatusBadge } from '@/components/documents/document-grid'
import { FileIcon } from '@/components/documents/file-icon'
import { isImageType } from '@/lib/upload/file-types'
import type { ClassroomDocRow } from '@/components/classroom/classroom-document-preview'
import type { Document } from '@/lib/db/types'

function ClassroomDocThumb({
  classroomId,
  doc,
  fallback,
  className,
}: {
  classroomId: string
  doc: Pick<ClassroomDocRow, 'id' | 'file_type' | 'status'>
  fallback: React.ReactNode
  className: string
}) {
  const [failed, setFailed] = useState(false)
  const showThumb =
    isImageType(doc.file_type) &&
    doc.status !== 'pending' &&
    doc.status !== 'processing' &&
    !failed

  if (!showThumb) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/classroom/${classroomId}/documents/${doc.id}`}
      alt=""
      draggable={false}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function ClassroomAddDocTile({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-dashed bg-card p-3 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition cursor-pointer disabled:opacity-50 min-h-[9.5rem]"
    >
      <Plus className="h-8 w-8" />
      <p className="text-xs font-medium">Thêm tài liệu</p>
    </button>
  )
}

export function ClassroomDocGridItem({
  classroomId,
  doc,
  onOpen,
  onDelete,
  canDelete,
}: {
  classroomId: string
  doc: ClassroomDocRow
  onOpen: () => void
  onDelete?: () => void
  canDelete?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = doc.status as Document['status']

  return (
    <div
      className="group relative rounded-lg border bg-card p-2.5 cursor-pointer select-none transition-all hover:shadow-md hover:border-primary/30"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex flex-col items-center text-center gap-2">
        <ClassroomDocThumb
          classroomId={classroomId}
          doc={doc}
          fallback={<FileIcon type={doc.file_type} />}
          className="h-20 w-full rounded-md border bg-muted/40 object-cover"
        />
        <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{doc.filename}</p>
        {status !== 'done' && <StatusBadge status={status} />}
      </div>

      {canDelete && onDelete && (
        <>
          <button
            type="button"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute top-8 right-2 z-10 bg-popover border rounded-md shadow-md py-1 min-w-[100px]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-muted cursor-pointer"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
              >
                Xóa
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
