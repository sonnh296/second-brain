'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PreviewPayload {
  filename: string
  file_type: string
  status: string
  content: string | null
  preview_type: string
  message?: string
}

export default function DocumentViewPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    fetch(`/api/documents/${id}/preview`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error || 'Không tải được tài liệu')
        }
        return res.json() as Promise<PreviewPayload>
      })
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được tài liệu')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {preview?.filename ?? 'Đang tải...'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Xem nội dung đã trích xuất</p>
          </div>
          {id ? (
            <a
              href={`/api/documents/${id}/download?download=1`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <Download className="h-4 w-4" />
              Tải file gốc
            </a>
          ) : null}
        </div>

        {loading && <p className="text-sm text-muted-foreground">Đang tải nội dung...</p>}
        {!loading && error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && preview?.content && (
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed rounded-lg border bg-muted/40 p-4">
            {preview.content}
          </pre>
        )}
        {!loading && !error && !preview?.content && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>{preview?.message || 'Không có nội dung để hiển thị trong trình duyệt.'}</p>
            <Link href="/documents" className="underline underline-offset-2">
              Về thư viện tài liệu
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
