'use client'

import { useCallback, useRef, useState } from 'react'
import { putToR2WithProgress } from '@/lib/upload/put-with-progress'

export function ClassroomUploadButton({
  classroomId,
  folderId,
  onDone,
  label = 'Upload',
}: {
  classroomId: string
  folderId: string
  onDone?: () => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File) => {
      setError(null)
      setProgress(0)
      try {
        const presign = await fetch(`/api/classroom/${classroomId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            size: file.size,
            folder_id: folderId,
          }),
        })
        if (!presign.ok) {
          const d = await presign.json().catch(() => ({}))
          throw new Error(d.error ?? 'Presign failed')
        }
        const { document_id, upload_url, content_type } = await presign.json()
        await putToR2WithProgress(upload_url, file, content_type, setProgress)
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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setProgress(null)
      }
    },
    [classroomId, folderId, onDone]
  )

  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={progress !== null}
        onClick={() => inputRef.current?.click()}
        className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        {progress !== null ? `${progress}%` : label}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  )
}
