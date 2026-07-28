'use client'

import { Badge } from '@/components/ui/badge'
import { isImageType } from '@/lib/upload/file-types'
import type { CitedSource } from '@/lib/db/types'

export function SourceBadge({
  src,
  onImageClick,
}: {
  src: CitedSource
  onImageClick: (src: CitedSource) => void
}) {
  const isImage = isImageType(src.file_type ?? '')
  const isNote = src.file_type === 'note'
  const isPdf = src.file_type === 'pdf'
  const hasLink = !!src.document_id
  const pageAnchor = isPdf && src.page ? `#page=${src.page}` : ''

  const handleClick = () => {
    if (!hasLink || !src.document_id) return
    if (isImage) {
      onImageClick(src)
    } else if (isNote) {
      window.open('/documents', '_blank')
    } else {
      window.open(`/api/documents/${src.document_id}/download${pageAnchor}`, '_blank')
    }
  }

  const title = !hasLink
    ? undefined
    : isImage
      ? 'Xem ảnh'
      : isNote
        ? 'Mở ghi chú'
        : isPdf && src.page
          ? `Mở trang ${src.page} trong tab mới`
          : 'Mở tài liệu trong tab mới'

  return (
    <Badge
      variant="outline"
      className={`text-xs gap-1 select-none ${
        hasLink
          ? 'cursor-pointer hover:bg-accent hover:border-accent-foreground/30 transition-colors'
          : 'opacity-60'
      }`}
      onClick={hasLink ? handleClick : undefined}
      title={title}
    >
      <span>{isImage ? '🖼️' : isNote ? '📝' : '📄'}</span>
      <span className="max-w-[120px] sm:max-w-[160px] truncate">{src.filename}</span>
      {isPdf && src.page ? <span className="opacity-60">tr.{src.page}</span> : null}
      {hasLink && <span className="opacity-40 text-[10px]">↗</span>}
    </Badge>
  )
}
