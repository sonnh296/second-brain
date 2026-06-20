'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Document } from '@/lib/db/types'

interface NoteModalProps {
  mode: 'create' | 'edit'
  doc?: Document
  title: string
  content: string
  saving: boolean
  error: string
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onSave: () => void
  onClose: () => void
}

export function NoteModal({
  mode,
  title,
  content,
  saving,
  error,
  onTitleChange,
  onContentChange,
  onSave,
  onClose,
}: NoteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg max-h-[90vh] shadow-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="shrink-0">
          <CardTitle className="text-base">
            {mode === 'create' ? 'Thêm ghi chú' : 'Sửa ghi chú'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col min-h-0 flex-1 gap-3">
          <ScrollArea className="flex-1 max-h-[calc(90vh-10rem)] pr-3">
            <div className="space-y-3">
              <div>
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
              <div>
                <Label htmlFor="modal-note-content" className="text-xs">
                  Nội dung
                </Label>
                <Textarea
                  id="modal-note-content"
                  value={content}
                  onChange={(e) => onContentChange(e.target.value)}
                  rows={12}
                  className="mt-1 min-h-[200px] max-h-[50vh] resize-y text-sm leading-relaxed"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 shrink-0 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving || !title.trim() || !content.trim()}
            >
              {saving ? 'Đang lưu...' : mode === 'create' ? 'Lưu' : 'Cập nhật'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
