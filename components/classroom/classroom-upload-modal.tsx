'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileDropzone } from '@/components/documents/file-dropzone'
import { ClassroomModal } from '@/components/classroom/classroom-modal'
import { cn } from '@/lib/utils'
import { putToR2WithProgress } from '@/lib/upload/put-with-progress'

function splitFilename(filename: string): { base: string; ext: string } {
  const i = filename.lastIndexOf('.')
  if (i <= 0) return { base: filename, ext: '' }
  return { base: filename.slice(0, i), ext: filename.slice(i) }
}

export function ClassroomUploadModal({
  open,
  classroomId,
  folderId,
  onClose,
  onDone,
}: {
  open: boolean
  classroomId: string
  folderId: string
  onClose: () => void
  onDone?: () => void
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filename, setFilename] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setSelectedFile(null)
      setFilename('')
      setUploading(false)
      setProgress(null)
      setError('')
      setConfirmClose(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !selectedFile) return
    const t = window.setTimeout(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, selectedFile])

  const requestClose = useCallback(() => {
    if (uploading || confirmClose) return
    if (selectedFile) {
      setConfirmClose(true)
      return
    }
    onClose()
  }, [uploading, confirmClose, selectedFile, onClose])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, requestClose])

  function onFileSelect(file: File | null) {
    setSelectedFile(file)
    setFilename(file?.name ?? '')
    setError('')
  }

  const { base: nameBase, ext: nameExt } = splitFilename(filename)
  const canSave = Boolean(selectedFile && nameBase.trim() && folderId)

  async function submit() {
    if (!selectedFile || !canSave || uploading) return
    const uploadName = `${nameBase.trim()}${nameExt}`
    setUploading(true)
    setError('')
    setProgress(0)
    try {
      const presign = await fetch(`/api/classroom/${classroomId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: uploadName,
          size: selectedFile.size,
          folder_id: folderId,
        }),
      })
      if (!presign.ok) {
        const d = await presign.json().catch(() => ({}))
        throw new Error(d.error ?? 'Upload failed')
      }
      const { document_id, upload_url, content_type } = await presign.json()
      await putToR2WithProgress(upload_url, selectedFile, content_type, setProgress)
      const complete = await fetch(`/api/classroom/${classroomId}/documents/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id }),
      })
      if (!complete.ok) {
        const d = await complete.json().catch(() => ({}))
        throw new Error(d.error ?? 'Complete failed')
      }
      onDone?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải lên')
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50"
        onClick={requestClose}
        role="presentation"
      >
        <div
          className="w-full max-w-3xl lg:max-w-4xl h-[min(90vh,720px)] rounded-xl border bg-background shadow-xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Thêm tài liệu"
        >
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <h2 className="text-base font-semibold shrink-0">Thêm tài liệu</h2>
              {selectedFile && (
                <>
                  <span className="text-muted-foreground shrink-0" aria-hidden>
                    ·
                  </span>
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <Input
                      ref={nameInputRef}
                      value={nameBase}
                      onChange={(e) => setFilename(`${e.target.value}${nameExt}`)}
                      disabled={uploading}
                      placeholder="Tên file"
                      aria-label="Tên file"
                      className="h-8 text-sm font-medium min-w-0"
                    />
                    {nameExt ? (
                      <span className="text-sm text-muted-foreground shrink-0 tabular-nums">
                        {nameExt}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={requestClose}
              disabled={uploading}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <FileDropzone
              disabled={uploading}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
            />
          </div>

          <div className="shrink-0 border-t bg-background p-3 space-y-2">
            {uploading && progress !== null && (
              <div className="w-full">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Đang tải lên...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
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
                onClick={requestClose}
                disabled={uploading}
              >
                Hủy
              </Button>
              <Button
                type="button"
                className={cn(
                  'flex-1',
                  !canSave &&
                    'bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground opacity-70'
                )}
                variant={canSave ? 'default' : 'secondary'}
                disabled={uploading || !canSave}
                onClick={() => void submit()}
              >
                {uploading ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ClassroomModal
        open={confirmClose}
        title="Đóng cửa sổ tải lên?"
        onClose={() => setConfirmClose(false)}
        overlayClassName="z-[60]"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmClose(false)}
            >
              Tiếp tục
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => {
                setConfirmClose(false)
                onClose()
              }}
            >
              Đóng
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">File đã chọn sẽ bị bỏ.</p>
      </ClassroomModal>
    </>
  )
}
