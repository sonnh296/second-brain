'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FileDropzone } from '@/components/documents/file-dropzone'
import { DocumentTagEditor } from '@/components/documents/tag-manager'
import { cn } from '@/lib/utils'
import { MAX_DOCUMENT_DESCRIPTION_LENGTH } from '@/lib/upload/file-types'
import type { Document, Tag } from '@/lib/db/types'

type UploadTab = 'file' | 'meta'

interface UploadModalProps {
  open: boolean
  reuploadDoc: Document | null
  selectedFile: File | null
  description: string
  tagIds: string[]
  allTags: Tag[]
  uploading: boolean
  uploadProgress: number | null
  error: string
  onFileSelect: (file: File | null) => void
  onDescriptionChange: (v: string) => void
  onTagIdsChange: (ids: string[]) => void
  onSubmit: () => void | Promise<void>
  onClose: () => void
}

export function UploadModal({
  open,
  reuploadDoc,
  selectedFile,
  description,
  tagIds,
  allTags,
  uploading,
  uploadProgress,
  error,
  onFileSelect,
  onDescriptionChange,
  onTagIdsChange,
  onSubmit,
  onClose,
}: UploadModalProps) {
  const [tab, setTab] = useState<UploadTab>('file')
  const isReupload = Boolean(reuploadDoc)

  useEffect(() => {
    if (open) setTab('file')
  }, [open, reuploadDoc?.id])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !uploading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, uploading, onClose])

  if (!open) return null

  const tabBtn = (id: UploadTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        'flex-1 px-2.5 py-2.5 text-sm transition-colors cursor-pointer whitespace-nowrap',
        tab === id
          ? 'border-b-2 border-primary font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50"
      onClick={() => {
        if (!uploading) onClose()
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl lg:max-w-4xl h-[min(90vh,780px)] rounded-xl border bg-background shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isReupload ? 'Thay thế file' : 'Tải tài liệu lên'}
      >
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">
              {isReupload ? 'Thay thế file' : 'Tải tài liệu lên'}
            </h2>
            {isReupload && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {reuploadDoc?.filename}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={onClose}
            disabled={uploading}
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!isReupload && (
          <div className="shrink-0 flex border-b">
            {tabBtn('file', 'Tài liệu')}
            {tabBtn('meta', 'Mô tả và tag')}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {(isReupload || tab === 'file') && (
            <div className="space-y-3">
              {isReupload && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                  File mới sẽ thay thế bản hiện tại. Nội dung cũ sẽ bị ghi đè khi xử lý xong.
                </div>
              )}
              <FileDropzone
                disabled={uploading}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
              />
            </div>
          )}

          {!isReupload && tab === 'meta' && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Mô tả tài liệu</Label>
                <Textarea
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  placeholder="Thêm mô tả để dễ tìm lại tài liệu sau này..."
                  rows={10}
                  maxLength={MAX_DOCUMENT_DESCRIPTION_LENGTH}
                  className="mt-1.5 w-full resize-y text-sm min-h-40 leading-relaxed"
                  disabled={uploading}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {description.length.toLocaleString('vi-VN')} /{' '}
                  {MAX_DOCUMENT_DESCRIPTION_LENGTH.toLocaleString('vi-VN')} ký tự
                </p>
              </div>
              <DocumentTagEditor
                allTags={allTags}
                selectedTagIds={tagIds}
                saving={false}
                onChange={onTagIdsChange}
                hideSaveButton
              />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-background p-3 space-y-2">
          {uploading && uploadProgress !== null && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>
                  {uploadProgress < 100
                    ? 'Đang tải lên...'
                    : 'Đang tạo phụ đề (một lần)...'}
                </span>
                <span>
                  {uploadProgress < 100 ? `${uploadProgress}%` : '...'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: uploadProgress < 100 ? `${uploadProgress}%` : '100%',
                  }}
                />
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={uploading}
            >
              Hủy
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={uploading || !selectedFile}
              onClick={() => void onSubmit()}
            >
              {uploading ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
