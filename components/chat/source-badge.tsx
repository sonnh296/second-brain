'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { buildDocumentViewerUrl } from '@/lib/documents/viewer-url'
import { isImageType, isTranscribableType } from '@/lib/upload/file-types'
import type { CitedSource } from '@/lib/db/types'

export function SourceBadge({ src }: { src: CitedSource }) {
  const isImage = isImageType(src.file_type ?? '')
  const isNote = src.file_type === 'note'
  const isPdf = src.file_type === 'pdf'
  const isMedia = isTranscribableType(src.file_type ?? '')
  const hasLink = !!src.document_id

  const href = hasLink
    ? buildDocumentViewerUrl(src.document_id!, {
        page: isPdf && src.page ? src.page : undefined,
        tab: isMedia ? 'subtitles' : undefined,
        fromChat: true,
      })
    : undefined

  let title: string | undefined
  if (!hasLink) title = undefined
  else if (isPdf && src.page) title = `Xem tài liệu — trang ${src.page}`
  else if (isMedia) title = 'Xem video/tài liệu và phụ đề'
  else if (isImage) title = 'Xem ảnh và mô tả'
  else if (isNote) title = 'Xem ghi chú'
  else title = 'Xem tài liệu'

  const badge = (
    <Badge
      variant="outline"
      className={`text-xs gap-1 select-none ${
        hasLink
          ? 'cursor-pointer hover:bg-accent hover:border-accent-foreground/30 transition-colors'
          : 'opacity-60'
      }`}
      title={title}
    >
      <span>{isImage ? '🖼️' : isNote ? '📝' : isMedia ? '🎬' : '📄'}</span>
      <span className="max-w-[120px] sm:max-w-[160px] truncate">{src.filename}</span>
      {isPdf && src.page ? <span className="opacity-60">tr.{src.page}</span> : null}
      {hasLink && <span className="opacity-40 text-[10px]">↗</span>}
    </Badge>
  )

  if (!href) return badge

  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="inline-flex">
      {badge}
    </Link>
  )
}
