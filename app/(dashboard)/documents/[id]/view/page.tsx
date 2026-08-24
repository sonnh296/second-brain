'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import { DocumentViewerPage } from '@/components/documents/document-viewer-page'

function DocumentViewContent() {
  const params = useParams<{ id: string }>()
  return <DocumentViewerPage documentId={params.id} />
}

export default function DocumentViewRoute() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Đang tải tài liệu...</p>
        </div>
      }
    >
      <DocumentViewContent />
    </Suspense>
  )
}
