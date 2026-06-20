'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge, STATUS_LABELS } from '@/components/documents/document-grid'
import type { Document } from '@/lib/db/types'

type DocStatus = Document['status']

interface PreviewData {
  filename: string
  file_type: string
  status: string
  content: string | null
  preview_type: string
  message?: string
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
  onClose: () => void
  onEditName: (v: string) => void
  onEditDescription: (v: string) => void
  onSaveMetadata: () => void
  onEditNote?: () => void
  onDelete: () => void
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
  onClose,
  onEditName,
  onEditDescription,
  onSaveMetadata,
  onEditNote,
  onDelete,
}: DocumentPreviewPanelProps) {
  return (
    <div className="w-80 lg:w-96 shrink-0 flex flex-col min-h-0 bg-muted/10">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b">
        <p className="text-sm font-medium truncate">Chi tiết</p>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
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
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p>Loại: {typeLabels[doc.file_type] ?? doc.file_type}</p>
            <p>Kích thước: {formatBytes(doc.file_size_bytes)}</p>
            {doc.chunk_count != null && <p>Chunks: {doc.chunk_count}</p>}
            <p>Ngày tạo: {new Date(doc.created_at).toLocaleDateString('vi-VN')}</p>
            <StatusBadge status={doc.status as DocStatus} />
          </div>
          <div className="flex flex-col gap-2 pt-2">
            {onEditNote && (
              <Button variant="outline" size="sm" onClick={onEditNote}>
                Sửa nội dung
              </Button>
            )}
            {doc.file_type !== 'note' && doc.status === 'done' && (
              <a
                href={`/api/documents/${doc.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
              >
                Mở file gốc
              </a>
            )}
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Xóa
            </Button>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Xem trước</p>
            {previewLoading ? (
              <p className="text-xs text-muted-foreground">Đang tải...</p>
            ) : preview?.content ? (
              <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto rounded border bg-background p-2">
                {preview.content.slice(0, 2000)}
                {preview.content.length > 2000 && '...'}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">{preview?.message ?? 'Không có nội dung'}</p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

export { STATUS_LABELS }
