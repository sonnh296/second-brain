'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, File as FileIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { UPLOAD_ACCEPT } from '@/lib/upload/file-types'

const IMAGE_PREVIEW_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
])

const PASTE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

function normalizePasteFile(file: File): File {
  if (file.name && file.name !== 'image.png' && !file.name.startsWith('image.')) {
    return file
  }
  const ext = PASTE_EXT[file.type] ?? 'png'
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  return new File([file], `paste-${stamp}.${ext}`, {
    type: file.type || 'image/png',
    lastModified: Date.now(),
  })
}

function fileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue
    if (item.type && !item.type.startsWith('image/')) continue
    const blob = item.getAsFile()
    if (!blob) continue
    if (blob.type && !blob.type.startsWith('image/')) continue
    // Empty type still ok if item.type was image/*
    if (!blob.type && item.type && !item.type.startsWith('image/')) continue
    return normalizePasteFile(
      blob.type ? blob : new File([blob], blob.name || 'paste.png', { type: item.type || 'image/png' })
    )
  }

  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith('image/')) return normalizePasteFile(file)
  }

  return null
}

interface FileDropzoneProps {
  disabled?: boolean
  onFileSelect: (file: File | null) => void
  selectedFile: File | null
}

export function FileDropzone({
  disabled,
  onFileSelect,
  selectedFile,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onFileSelectRef = useRef(onFileSelect)
  const [dragOver, setDragOver] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    onFileSelectRef.current = onFileSelect
  }, [onFileSelect])

  useEffect(() => {
    if (!selectedFile || !IMAGE_PREVIEW_TYPES.has(selectedFile.type)) {
      setImagePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(selectedFile)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0] ?? null
      onFileSelect(file)
    },
    [onFileSelect]
  )

  const applyClipboardImage = useCallback((data: DataTransfer | null) => {
    if (disabled) return false
    const file = fileFromClipboard(data)
    if (!file) return false
    onFileSelectRef.current(file)
    return true
  }, [disabled])

  useEffect(() => {
    if (disabled) return
    function onPaste(e: ClipboardEvent) {
      // If clipboard has an image, always take it (even when focus is in the
      // filename field or the hidden file input after canceling the picker).
      if (!applyClipboardImage(e.clipboardData)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [disabled, applyClipboardImage])

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    handleFiles(e.dataTransfer.files)
  }

  function clearFile() {
    onFileSelect(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // After a file is chosen, don't keep this as a Space/Enter target — that steals
  // keystrokes from the filename rename input in the upload modal header.
  const pickable = !disabled && !selectedFile

  return (
    <div className="w-full">
      <div
        role={pickable ? 'button' : undefined}
        tabIndex={pickable ? 0 : -1}
        onPaste={(e) => {
          if (applyClipboardImage(e.clipboardData)) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onKeyDown={(e) => {
          if (!pickable) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'relative flex min-h-[14rem] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 transition-colors cursor-pointer',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 bg-background hover:border-primary/50 hover:bg-muted/30',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          disabled={disabled}
          tabIndex={-1}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {selectedFile ? (
          <>
            {imagePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreviewUrl}
                alt={selectedFile.name}
                className="max-h-64 w-auto max-w-full rounded-md border object-contain bg-muted/40"
              />
            ) : (
              <FileIcon className="h-8 w-8 text-primary shrink-0" />
            )}
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                clearFile()
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Bỏ chọn
            </Button>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Kéo thả hoặc dán ảnh (⌘V)</p>
            <p className="text-xs text-muted-foreground">hoặc</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-none"
              tabIndex={-1}
            >
              Chọn file
            </Button>
            <p className="text-[10px] text-muted-foreground text-center max-w-md mt-1">
              PDF, Word, ảnh, Excel, PowerPoint, âm thanh, video và nhiều định dạng khác
            </p>
          </>
        )}
      </div>
    </div>
  )
}
