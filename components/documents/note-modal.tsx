'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor, type NoteImageScope } from '@/components/ui/rich-text-editor'
import { cn } from '@/lib/utils'
import type { Document } from '@/lib/db/types'

interface NoteModalProps {
  mode: 'create' | 'edit'
  doc?: Document
  title: string
  content: string
  initialTitle?: string
  initialContent?: string
  saving: boolean
  error: string
  imageScope: NoteImageScope
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onSave: () => void
  onClose: () => void
}

export function NoteModal({
  mode,
  title,
  content,
  initialTitle = '',
  initialContent = '',
  saving,
  error,
  imageScope,
  onTitleChange,
  onContentChange,
  onSave,
  onClose,
}: NoteModalProps) {
  const canSaveCreate = Boolean(title.trim() && content.trim())
  const canSaveEdit =
    title.trim() !== initialTitle.trim() || content.trim() !== initialContent.trim()
  const canSave = mode === 'create' ? canSaveCreate : canSaveCreate && canSaveEdit

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-2xl h-[min(90vh,720px)] shadow-lg flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="shrink-0 pb-3">
          <CardTitle className="text-base">
            {mode === 'create' ? 'Thêm ghi chú' : 'Sửa ghi chú'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col min-h-0 flex-1 gap-3 overflow-hidden">
          <div className="shrink-0">
            <Label htmlFor="modal-note-title" className="text-xs">
              Tiêu đề
            </Label>
            <Input
              id="modal-note-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <Label className="text-xs shrink-0 mb-1">Nội dung</Label>
            <RichTextEditor
              value={content}
              onChange={onContentChange}
              minHeightClass="min-h-0"
              className="flex-1"
              placeholder="Viết ghi chú..."
              disabled={saving}
              imageScope={imageScope}
            />
          </div>
          {error && <p className="shrink-0 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 shrink-0 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button
              size="sm"
              variant={canSave ? 'default' : 'secondary'}
              onClick={onSave}
              disabled={saving || !canSave}
              className={cn(
                !canSave &&
                  'bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground opacity-70'
              )}
            >
              {saving ? 'Đang lưu...' : mode === 'create' ? 'Lưu' : 'Cập nhật'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
