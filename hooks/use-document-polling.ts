'use client'

import { useEffect, useRef } from 'react'
import type { Document } from '@/lib/db/types'

type DocStatus = Document['status']

interface StatusUpdate {
  status: DocStatus
  error_message: string | null
  chunk_count: number | null
}

export function useDocumentPolling(
  documents: Document[],
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>
) {
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const pendingDocs = documents.filter(
      (d) => d.status === 'pending' || d.status === 'processing'
    )

    if (pendingDocs.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }

    if (!pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const ids = pendingDocs.map((d) => d.id).join(',')
        const res = await fetch(`/api/documents/status?ids=${ids}`)
        if (!res.ok) return

        const updates = (await res.json()) as Record<string, StatusUpdate>
        setDocuments((prev) =>
          prev.map((doc) => {
            const update = updates[doc.id]
            if (!update) return doc
            return {
              ...doc,
              status: update.status,
              error_message: update.error_message,
              chunk_count: update.chunk_count,
            }
          })
        )
      }, 2000)
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [documents, setDocuments])
}
