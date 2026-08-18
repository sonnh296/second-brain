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

interface FileDropzoneProps {
  disabled?: boolean
  onFileSelect: (file: File | null) => void
  selectedFile: File | null
}

export function FileDropzone({ disabled, onFileSelect, selectedFile }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

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

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
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
          'relative flex min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors cursor-pointer',
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
          onChange={(e) => handleFiles(e.target.files)}
        />

        {selectedFile ? (
          <>
            {imagePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreviewUrl}
                alt={selectedFile.name}
                className="max-h-48 w-auto max-w-full rounded-md border object-contain bg-muted/40"
              />
            ) : (
              <FileIcon className="h-8 w-8 text-primary shrink-0" />
            )}
            <p className="text-sm font-medium text-center break-all px-2 max-w-2xl">
              {selectedFile.name}
            </p>
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
            <p className="text-sm font-medium">Kéo thả file vào đây</p>
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
