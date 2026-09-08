'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileIcon as FileLucide, Loader2, Plus } from 'lucide-react'
import { ClassroomUploadModal } from '@/components/classroom/classroom-upload-modal'
import { ClassroomLoading, ClassroomTileSkeleton } from '@/components/classroom/classroom-loading'
import {
  ClassroomDocumentPreview,
  type ClassroomDocRow,
} from '@/components/classroom/classroom-document-preview'

type Doc = ClassroomDocRow

const TILE =
  'w-[7.25rem] sm:w-[7.5rem] flex flex-col items-center text-center gap-1.5 rounded-lg border p-2.5 hover:bg-muted/50 transition'

function statusLabel(status: string) {
  if (status === 'pending' || status === 'processing') return 'Đang xử lý...'
  if (status === 'failed') return 'Lỗi'
  if (status === 'done') return 'Xong'
  return status
}

export default function SharedMaterialsPage() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ClassroomDocRow | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const meta = await fetch(`/api/classroom/${id}`)
    if (!meta.ok) {
      setLoading(false)
      return
    }
    const data = await meta.json()
    setRole(data.role)
    const fid = data.shared_folder?.id as string | undefined
    if (!fid) {
      setLoading(false)
      return
    }
    setFolderId(fid)
    const res = await fetch(`/api/classroom/${id}/documents?folder_id=${fid}`)
    if (res.ok) {
      const d = await res.json()
      setDocs(d.documents ?? [])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const pending = docs.some((d) => d.status === 'pending' || d.status === 'processing')
    if (!pending) return
    const t = window.setInterval(() => {
      void load({ silent: true })
    }, 4000)
    return () => window.clearInterval(t)
  }, [docs, load])

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <ClassroomTileSkeleton count={3} />
        <ClassroomLoading label="Đang tải tài liệu chung..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex flex-wrap gap-3">
        {role === 'teacher' && (
          <button
            type="button"
            disabled={!folderId}
            onClick={() => {
              setMsg(null)
              setUploadOpen(true)
            }}
            className={`${TILE} border-dashed text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50`}
          >
            <Plus className="h-8 w-8" />
            <p className="text-xs font-medium">Thêm tài liệu</p>
          </button>
        )}

        {docs.map((d) => {
          const processing = d.status === 'pending' || d.status === 'processing'
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setPreviewDoc(d)}
              className={`${TILE} cursor-pointer`}
            >
              {processing ? (
                <Loader2 className="h-9 w-9 text-primary/70 animate-spin" />
              ) : (
                <FileLucide className="h-9 w-9 text-foreground/60" />
              )}
              <p className="text-xs font-medium line-clamp-2 w-full leading-snug">
                {d.filename}
              </p>
              <p
                className={`text-[10px] ${
                  d.status === 'failed'
                    ? 'text-red-600'
                    : processing
                      ? 'text-amber-700'
                      : 'text-muted-foreground'
                }`}
              >
                {statusLabel(d.status)}
              </p>
            </button>
          )
        })}
      </div>

      {docs.length === 0 && role === 'student' && (
        <p className="text-sm text-muted-foreground">Trống</p>
      )}

      {folderId && (
        <ClassroomUploadModal
          open={uploadOpen}
          classroomId={id}
          folderId={folderId}
          onClose={() => setUploadOpen(false)}
          onDone={() => void load({ silent: true })}
        />
      )}

      <ClassroomDocumentPreview
        open={Boolean(previewDoc)}
        classroomId={id}
        doc={previewDoc}
        role={role}
        onClose={() => setPreviewDoc(null)}
        onDeleted={() => void load({ silent: true })}
      />
    </div>
  )
}
