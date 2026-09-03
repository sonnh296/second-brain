'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import {
  ContentPreview,
  ContentPreviewFooter,
  DescriptionPanel,
  SubtitlesPanel,
  type DocumentPanelTab,
} from '@/components/documents/document-preview-panel'
import { FileIcon } from '@/components/documents/file-icon'
import { StatusBadge } from '@/components/documents/document-grid'
import type { PreviewData } from '@/components/documents/types'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TYPE_LABELS, isBrowserInlineType, isImageType, isSpreadsheetType, isTranscribableType } from '@/lib/upload/file-types'
import { formatBytes } from '@/lib/usage/format'
import type { Document, Tag } from '@/lib/db/types'

const VALID_TABS = new Set<DocumentPanelTab>(['content', 'subtitles', 'description', 'details'])

function resolveSidebarTab(initial?: DocumentPanelTab): Exclude<DocumentPanelTab, 'content'> {
  if (initial === 'subtitles' || initial === 'description' || initial === 'details') return initial
  return 'description'
}

export function DocumentViewerPage({ documentId }: { documentId: string }) {
  const searchParams = useSearchParams()
  const fromChat = searchParams.get('from') === 'chat'
  const pageParam = parseInt(searchParams.get('page') ?? '', 10)
  const pdfStartPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined
  const tabParam = searchParams.get('tab')
  const initialTab =
    tabParam && VALID_TABS.has(tabParam as DocumentPanelTab)
      ? (tabParam as DocumentPanelTab)
      : undefined

  const [doc, setDoc] = useState<Document | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editContent, setEditContent] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [savingDescription, setSavingDescription] = useState(false)
  const [savingContent, setSavingContent] = useState(false)
  const [savingTags, setSavingTags] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<Exclude<DocumentPanelTab, 'content'>>(() =>
    resolveSidebarTab(initialTab)
  )

  const isMedia = doc ? isTranscribableType(doc.file_type) : false
  const viewerUrl = `/api/documents/${documentId}/download`
  const canInline = doc ? isBrowserInlineType(doc.file_type) : false
  const canOpenDownload =
    doc &&
    (doc.file_type === 'note' ||
      doc.status === 'done' ||
      isMedia ||
      isImageType(doc.file_type) ||
      isSpreadsheetType(doc.file_type))

  useEffect(() => {
    setSidebarTab(resolveSidebarTab(initialTab))
  }, [documentId, initialTab])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setPreviewLoading(true)
      setError(null)

      try {
        const [docRes, previewRes, tagsRes] = await Promise.all([
          fetch(`/api/documents/${documentId}`),
          fetch(`/api/documents/${documentId}/preview`),
          fetch('/api/tags'),
        ])

        if (cancelled) return

        if (!docRes.ok) {
          const body = (await docRes.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error || 'Không tải được tài liệu')
        }

        const docData = (await docRes.json()) as Document
        setDoc(docData)
        setEditDescription(docData.description ?? '')
        setSelectedTagIds(docData.tags?.map((tag) => tag.id) ?? [])

        if (previewRes.ok) {
          setPreview((await previewRes.json()) as PreviewData)
        } else {
          setPreview(null)
        }

        if (tagsRes.ok) {
          setAllTags((await tagsRes.json()) as Tag[])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không tải được tài liệu')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setPreviewLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [documentId])

  useEffect(() => {
    setEditContent(preview?.content ?? '')
  }, [preview?.content, documentId])

  async function saveDescription() {
    if (!doc) return
    setSaveError('')
    setSavingDescription(true)
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: editDescription.trim() || null }),
    })
    if (res.ok) {
      setDoc(await res.json())
    } else {
      const data = await res.json().catch(() => ({}))
      setSaveError(data.error ?? 'Không thể lưu mô tả')
    }
    setSavingDescription(false)
  }

  async function saveContent() {
    if (!doc) return
    const content = editContent.trim()
    if (!content) {
      setSaveError('Nội dung không được để trống')
      return
    }
    setSaveError('')
    setSavingContent(true)
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        doc.file_type === 'note' ? { note_content: content } : { content }
      ),
    })
    if (res.ok) {
      const updated = await res.json()
      setDoc(updated)
      setPreview((prev) => (prev ? { ...prev, content } : prev))
    } else {
      const data = await res.json().catch(() => ({}))
      setSaveError(data.error ?? 'Không thể lưu nội dung đã chỉnh sửa')
    }
    setSavingContent(false)
  }

  async function saveTags() {
    if (!doc) return
    setSavingTags(true)
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_ids: selectedTagIds }),
    })
    if (res.ok) {
      setDoc(await res.json())
    }
    setSavingTags(false)
  }

  const sidebarBtn = (id: Exclude<DocumentPanelTab, 'content'>, label: string) => (
    <button
      type="button"
      onClick={() => setSidebarTab(id)}
      className={cn(
        'flex-1 px-2.5 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap',
        sidebarTab === id
          ? 'border-b-2 border-primary font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  const backHref = useMemo(() => (fromChat ? '/chat' : '/documents'), [fromChat])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Đang tải tài liệu...</p>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive">{error ?? 'Không tìm thấy tài liệu'}</p>
        <Link href={backHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Quay lại
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-background">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b">
        <Link
          href={backHref}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'gap-1.5 shrink-0 px-2'
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          {fromChat ? 'Về chat' : 'Thư viện'}
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-semibold truncate">{doc.filename}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {TYPE_LABELS[doc.file_type] ?? doc.file_type}
            {pdfStartPage ? ` · Trang ${pdfStartPage}` : ''}
          </p>
        </div>
        <Link
          href="/documents"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 hidden sm:inline-flex')}
        >
          Mở trong thư viện
        </Link>
      </div>

      {saveError && (
        <div className="shrink-0 border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r">
          <ContentPreview
            doc={doc}
            preview={preview}
            previewLoading={previewLoading}
            editContent={editContent}
            isActive
            onEditContent={setEditContent}
            pdfStartPage={pdfStartPage}
            layout="page"
          />
          <ContentPreviewFooter
            doc={doc}
            preview={preview}
            editContent={editContent}
            savingContent={savingContent}
            onSaveContent={saveContent}
            viewerUrl={viewerUrl}
            canInline={canInline}
            canOpenDownload={Boolean(canOpenDownload)}
          />
        </div>

        <aside className="w-full lg:w-[min(100vw,24rem)] xl:w-96 shrink-0 flex flex-col min-h-0 max-h-[45vh] lg:max-h-none bg-muted/10">
          <div className="shrink-0 flex border-b overflow-x-auto">
            {isMedia && sidebarBtn('subtitles', 'Phụ đề')}
            {sidebarBtn('description', 'Mô tả và tag')}
            {sidebarBtn('details', 'Chi tiết')}
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {isMedia && (
              <div
                className={cn(
                  'flex-1 min-h-0 flex flex-col overflow-hidden',
                  sidebarTab !== 'subtitles' && 'hidden'
                )}
              >
                <SubtitlesPanel
                  preview={preview}
                  previewLoading={previewLoading}
                  status={doc.status}
                />
              </div>
            )}

            <div
              className={cn(
                'flex-1 min-h-0 flex flex-col overflow-hidden',
                sidebarTab !== 'description' && 'hidden'
              )}
            >
              <DescriptionPanel
                editDescription={editDescription}
                originalDescription={doc.description ?? ''}
                savingDescription={savingDescription}
                onEditDescription={setEditDescription}
                onSaveDescription={saveDescription}
                allTags={allTags}
                selectedTagIds={selectedTagIds}
                originalTagIds={doc.tags?.map((t) => t.id) ?? []}
                savingTags={savingTags}
                onTagIdsChange={setSelectedTagIds}
                onSaveTags={saveTags}
              />
            </div>

            <div
              className={cn(
                'flex-1 min-h-0 overflow-y-auto',
                sidebarTab !== 'details' && 'hidden'
              )}
            >
              <div className="p-4 space-y-3">
                <div className="flex justify-center py-2">
                  <FileIcon type={doc.file_type} />
                </div>
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                  <p>Loại: {TYPE_LABELS[doc.file_type] ?? doc.file_type}</p>
                  <p>Kích thước: {formatBytes(doc.file_size_bytes)}</p>
                  {doc.chunk_count != null && <p>Chunks: {doc.chunk_count}</p>}
                  <p>Ngày tạo: {new Date(doc.created_at).toLocaleDateString('vi-VN')}</p>
                  <StatusBadge status={doc.status} />
                </div>
                {!fromChat && (
                  <Link
                    href="/documents"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
                  >
                    Quản lý trong thư viện
                  </Link>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
