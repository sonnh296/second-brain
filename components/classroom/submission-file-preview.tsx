'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  isBrowserInlineType,
  isImageType,
  isSpreadsheetType,
  typeFromExtension,
} from '@/lib/upload/file-types'
import { SpreadsheetPreview } from '@/components/documents/spreadsheet-preview'

export type SubmissionFileMeta = {
  file_id?: string
  filename: string
  file_type?: string
}

function resolveFileType(file: SubmissionFileMeta): string {
  if (file.file_type && file.file_type !== 'file') return file.file_type
  return typeFromExtension(file.filename) ?? file.file_type ?? 'file'
}

function PreviewLoading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function SingleFilePreview({
  filename,
  fileType,
  viewerUrl,
  downloadUrl,
}: {
  filename: string
  fileType: string
  viewerUrl: string
  downloadUrl: string
}) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
  }, [viewerUrl])

  if (fileType === 'pdf') {
    return (
      <div className="relative min-h-[280px] flex flex-col rounded border bg-muted/20 overflow-hidden">
        {loading && <PreviewLoading label="Đang tải PDF..." />}
        <iframe
          src={viewerUrl}
          title={filename}
          onLoad={() => setLoading(false)}
          className={cn(
            'w-full min-h-[280px] h-[min(50vh,420px)] border-0 bg-background transition-opacity',
            loading && 'opacity-0'
          )}
        />
      </div>
    )
  }

  if (isSpreadsheetType(fileType)) {
    return (
      <div className="rounded border bg-muted/20 overflow-hidden min-h-[200px]">
        <SpreadsheetPreview downloadUrl={viewerUrl} filename={filename} />
      </div>
    )
  }

  if (isImageType(fileType)) {
    return (
      <div className="relative flex items-center justify-center rounded border bg-muted/20 p-3 min-h-[160px]">
        {loading && <PreviewLoading label="Đang tải ảnh..." />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={viewerUrl}
          alt={filename}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          className={cn(
            'max-h-[min(50vh,420px)] max-w-full object-contain transition-opacity',
            loading && 'opacity-0'
          )}
        />
      </div>
    )
  }

  if (fileType === 'mp4' || fileType === 'mov') {
    return (
      <div className="relative flex items-center justify-center rounded border bg-black/90 p-2 min-h-[200px]">
        {loading && <PreviewLoading label="Đang tải video..." />}
        <video
          src={viewerUrl}
          controls
          preload="metadata"
          onLoadedData={() => setLoading(false)}
          onError={() => setLoading(false)}
          className={cn(
            'w-full max-h-[min(50vh,480px)] rounded transition-opacity',
            loading && 'opacity-0'
          )}
        />
      </div>
    )
  }

  if (fileType === 'mp3' || fileType === 'wav') {
    return (
      <div className="relative flex items-center justify-center rounded border bg-muted/20 p-4 min-h-[72px]">
        {loading && <PreviewLoading label="Đang tải audio..." />}
        <audio
          src={viewerUrl}
          controls
          preload="metadata"
          onLoadedData={() => setLoading(false)}
          onError={() => setLoading(false)}
          className={cn('w-full transition-opacity', loading && 'opacity-0')}
        />
      </div>
    )
  }

  if (isBrowserInlineType(fileType) && (fileType === 'txt' || fileType === 'md' || fileType === 'csv' || fileType === 'json' || fileType === 'html')) {
    return (
      <div className="relative rounded border bg-muted/20 overflow-hidden min-h-[160px]">
        {loading && <PreviewLoading label="Đang tải..." />}
        <iframe
          src={viewerUrl}
          title={filename}
          onLoad={() => setLoading(false)}
          className={cn(
            'w-full min-h-[200px] h-[min(40vh,320px)] border-0 bg-background transition-opacity',
            loading && 'opacity-0'
          )}
        />
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      Trình duyệt không xem trực tiếp loại file này —{' '}
      <a href={downloadUrl} className="text-sky-700 hover:underline">
        Tải về
      </a>
    </p>
  )
}

export function SubmissionFilePreviewList({
  files,
  viewerHref,
  className,
}: {
  files: SubmissionFileMeta[]
  /** Build stream URL for a file (inline by default). */
  viewerHref: (file: SubmissionFileMeta) => string | null
  className?: string
}) {
  if (files.length === 0) return null

  return (
    <ul className={cn('space-y-3', className)}>
      {files.map((f) => {
        const key = f.file_id ?? f.filename
        const viewerUrl = viewerHref(f)
        const fileType = resolveFileType(f)
        const downloadUrl = viewerUrl
          ? `${viewerUrl}${viewerUrl.includes('?') ? '&' : '?'}download=1`
          : null

        return (
          <li key={key} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-medium truncate" title={f.filename}>
                {f.filename}
              </span>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  className="shrink-0 text-sky-700 hover:underline text-xs"
                >
                  Tải về
                </a>
              )}
            </div>
            {viewerUrl ? (
              <SingleFilePreview
                filename={f.filename}
                fileType={fileType}
                viewerUrl={viewerUrl}
                downloadUrl={downloadUrl!}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{f.filename}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
