'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ClassroomUploadModal } from '@/components/classroom/classroom-upload-modal'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import {
  ClassroomDocumentPreview,
  type ClassroomDocRow,
} from '@/components/classroom/classroom-document-preview'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import {
  ClassroomAddDocTile,
  ClassroomDocGridItem,
} from '@/components/classroom/classroom-doc-grid'

type Doc = ClassroomDocRow

export default function SharedMaterialsPage() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [className, setClassName] = useState('')
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
    setClassName(data.classroom?.name ?? '')
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

  async function deleteDoc(docId: string) {
    if (!confirm('Xóa tài liệu này?')) return
    const res = await fetch(`/api/classroom/${id}/documents/${docId}`, { method: 'DELETE' })
    if (!res.ok) {
      setMsg('Không xóa được tài liệu')
      return
    }
    if (previewDoc?.id === docId) setPreviewDoc(null)
    void load({ silent: true })
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <ClassroomLoading label="Đang tải tài liệu chung..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp', href: `/classroom/${id}` },
          { label: 'Tài liệu chung' },
        ]}
      />

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {role === 'teacher' && (
          <ClassroomAddDocTile
            disabled={!folderId}
            onClick={() => {
              setMsg(null)
              setUploadOpen(true)
            }}
          />
        )}

        {docs.map((d) => (
          <ClassroomDocGridItem
            key={d.id}
            classroomId={id}
            doc={d}
            onOpen={() => setPreviewDoc(d)}
            canDelete={role === 'teacher'}
            onDelete={() => void deleteDoc(d.id)}
          />
        ))}
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
