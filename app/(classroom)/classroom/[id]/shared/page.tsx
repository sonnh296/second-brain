'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileIcon as FileLucide, Plus } from 'lucide-react'
import { putToR2WithProgress } from '@/lib/upload/put-with-progress'

type Doc = {
  id: string
  filename: string
  status: string
}

const TILE =
  'w-[7.25rem] sm:w-[7.5rem] flex flex-col items-center text-center gap-1.5 rounded-lg border p-2.5 hover:bg-muted/50 transition'

export default function SharedMaterialsPage() {
  const { id } = useParams<{ id: string }>()
  const fileRef = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const meta = await fetch(`/api/classroom/${id}`)
    if (!meta.ok) return
    const data = await meta.json()
    setRole(data.role)
    const fid = data.shared_folder?.id as string | undefined
    if (!fid) return
    setFolderId(fid)
    const res = await fetch(`/api/classroom/${id}/documents?folder_id=${fid}`)
    if (res.ok) {
      const d = await res.json()
      setDocs(d.documents ?? [])
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function uploadFile(file: File) {
    if (!folderId) return
    setMsg(null)
    setProgress(0)
    try {
      const presign = await fetch(`/api/classroom/${id}/documents`, {
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
        throw new Error(d.error ?? 'Upload failed')
      }
      const { document_id, upload_url, content_type } = await presign.json()
      await putToR2WithProgress(upload_url, file, content_type, setProgress)
      const complete = await fetch(`/api/classroom/${id}/documents/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id }),
      })
      if (!complete.ok) {
        const d = await complete.json().catch(() => ({}))
        throw new Error(d.error ?? 'Complete failed')
      }
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {progress !== null && (
        <p className="text-sm text-muted-foreground">Đang tải {progress}%</p>
      )}

      <div className="flex flex-wrap gap-3">
        {role === 'teacher' && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadFile(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={!folderId || progress !== null}
              onClick={() => fileRef.current?.click()}
              className={`${TILE} border-dashed text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50`}
            >
              <Plus className="h-8 w-8" />
              <p className="text-xs font-medium">Thêm mới</p>
            </button>
          </>
        )}

        {docs.map((d) => (
          <a
            key={d.id}
            href={`/api/classroom/${id}/documents/${d.id}?download=1`}
            className={TILE}
          >
            <FileLucide className="h-9 w-9 text-foreground/60" />
            <p className="text-xs font-medium line-clamp-2 w-full leading-snug">
              {d.filename}
            </p>
            <p className="text-[10px] text-muted-foreground">{d.status}</p>
          </a>
        ))}
      </div>

      {docs.length === 0 && role === 'student' && (
        <p className="text-sm text-muted-foreground">Trống</p>
      )}
    </div>
  )
}
