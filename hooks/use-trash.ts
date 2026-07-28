'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Document } from '@/lib/db/types'

type ConfirmFn = (opts: {
  title: string
  description: string
  confirmLabel: string
}) => Promise<boolean>

/**
 * Trash list + restore / permanent purge for the documents library.
 */
export function useTrash(
  trashMode: boolean,
  confirm: ConfirmFn,
  onRestored: () => void | Promise<void>
) {
  const [trashDocs, setTrashDocs] = useState<Document[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashAction, setTrashAction] = useState<{
    id: string
    type: 'purge' | 'restore'
  } | null>(null)

  const fetchTrash = useCallback(async () => {
    setTrashLoading(true)
    try {
      const res = await fetch('/api/documents?trash=1')
      if (res.ok) setTrashDocs(await res.json())
    } finally {
      setTrashLoading(false)
    }
  }, [])

  useEffect(() => {
    if (trashMode) void fetchTrash()
  }, [trashMode, fetchTrash])

  async function restoreDoc(documentId: string) {
    setTrashAction({ id: documentId, type: 'restore' })
    try {
      const res = await fetch(`/api/documents/${documentId}/restore`, {
        method: 'POST',
      })
      if (res.ok) {
        setTrashDocs((prev) => prev.filter((d) => d.id !== documentId))
        await onRestored()
      }
    } finally {
      setTrashAction((prev) => (prev?.id === documentId ? null : prev))
    }
  }

  async function purgeDoc(documentId: string) {
    const ok = await confirm({
      title: 'Xóa vĩnh viễn?',
      description: 'Không thể khôi phục sau khi xóa.',
      confirmLabel: 'Xóa vĩnh viễn',
    })
    if (!ok) return
    setTrashAction({ id: documentId, type: 'purge' })
    try {
      const res = await fetch(`/api/documents/${documentId}?permanent=1`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setTrashDocs((prev) => prev.filter((d) => d.id !== documentId))
      }
    } finally {
      setTrashAction((prev) => (prev?.id === documentId ? null : prev))
    }
  }

  return {
    trashDocs,
    trashLoading,
    trashAction,
    restoreDoc,
    purgeDoc,
    fetchTrash,
  }
}
