'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  FileText,
  FileType,
  StickyNote,
  File,
  Upload,
  Plus,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DriveGridItem, DriveListItem } from '@/components/documents/document-grid'
import { DocumentPreviewPanel } from '@/components/documents/document-preview-panel'
import { NoteModal } from '@/components/documents/note-modal'
import { useDocumentPolling } from '@/hooks/use-document-polling'
import type { Document } from '@/lib/db/types'

type DocStatus = 'pending' | 'processing' | 'done' | 'failed'
type TypeFilter = 'all' | 'note' | 'pdf' | 'docx' | 'txt'
type StatusFilter = 'all' | DocStatus
type SortBy = 'date' | 'name'
type ViewMode = 'grid' | 'list'

interface PreviewData {
  filename: string
  file_type: string
  status: string
  content: string | null
  preview_type: string
  message?: string
}

interface NoteModalState {
  mode: 'create' | 'edit'
  doc?: Document
}

const TYPE_LABELS: Record<string, string> = {
  all: 'Tất cả',
  note: 'Ghi chú',
  pdf: 'PDF',
  docx: 'Word',
  txt: 'Văn bản',
}

const STATUS_LABELS: Record<DocStatus, string> = {
  done: 'Sẵn sàng',
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  failed: 'Lỗi',
}

const SIDEBAR_TYPES: { id: TypeFilter; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'Tất cả', icon: <File className="h-4 w-4" /> },
  { id: 'note', label: 'Ghi chú', icon: <StickyNote className="h-4 w-4" /> },
  { id: 'pdf', label: 'PDF', icon: <FileText className="h-4 w-4 text-red-500" /> },
  { id: 'docx', label: 'Word', icon: <FileType className="h-4 w-4 text-blue-500" /> },
  { id: 'txt', label: 'Văn bản', icon: <FileText className="h-4 w-4 text-muted-foreground" /> },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  switch (type) {
    case 'note':
      return <StickyNote className={`${cls} text-amber-500`} />
    case 'pdf':
      return <FileText className={`${cls} text-red-500`} />
    case 'docx':
      return <FileType className={`${cls} text-blue-500`} />
    case 'txt':
      return <FileText className={`${cls} text-slate-500`} />
    default:
      return <File className={`${cls} text-muted-foreground`} />
  }
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [uploadDescription, setUploadDescription] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    const res = await fetch('/api/documents')
    if (res.ok) setDocuments(await res.json())
  }, [])

  useEffect(() => {
    fetchDocuments().finally(() => setLoading(false))
  }, [fetchDocuments])

  useDocumentPolling(documents, setDocuments)

  useEffect(() => {
    if (selectedDoc) {
      setEditName(selectedDoc.filename)
      setEditDescription(selectedDoc.description ?? '')
    }
  }, [selectedDoc])

  const filteredDocs = useMemo(() => {
    let result = [...documents]
    if (typeFilter !== 'all') {
      result = result.filter((d) => d.file_type === typeFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((d) => d.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          d.filename.toLowerCase().includes(q) ||
          (d.description?.toLowerCase().includes(q) ?? false)
      )
    }
    result.sort((a, b) => {
      if (sortBy === 'name') return a.filename.localeCompare(b.filename, 'vi')
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return result
  }, [documents, typeFilter, statusFilter, searchQuery, sortBy])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length }
    for (const d of documents) {
      counts[d.file_type] = (counts[d.file_type] ?? 0) + 1
    }
    return counts
  }, [documents])

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('filename', file.name)
    if (uploadDescription.trim()) formData.append('description', uploadDescription.trim())
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) {
      setUploadError(data.error ?? 'Upload failed')
      setUploading(false)
      return
    }
    setUploading(false)
    setUploadDescription('')
    setShowUploadPanel(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await fetchDocuments()
  }

  function openCreateNoteModal() {
    setNoteModal({ mode: 'create' })
    setNoteTitle('')
    setNoteContent('')
    setNoteError('')
  }

  function openEditNoteModal(doc: Document) {
    setNoteModal({ mode: 'edit', doc })
    setNoteTitle(doc.filename)
    setNoteContent('')
    setNoteError('')
    fetch(`/api/documents/${doc.id}/preview`).then(async (res) => {
      if (res.ok) setNoteContent((await res.json()).content ?? '')
    })
  }

  function closeNoteModal() {
    setNoteModal(null)
    setNoteTitle('')
    setNoteContent('')
    setNoteError('')
  }

  async function saveNote() {
    if (!noteTitle.trim() || !noteContent.trim()) return
    setSavingNote(true)
    setNoteError('')
    if (noteModal?.mode === 'create') {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: noteTitle.trim(), content: noteContent.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setNoteError(data.error ?? 'Lưu thất bại')
        setSavingNote(false)
        return
      }
    } else if (noteModal?.doc) {
      const res = await fetch(`/api/documents/${noteModal.doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: noteTitle.trim(), note_content: noteContent.trim() }),
      })
      if (!res.ok) {
        setNoteError((await res.json()).error ?? 'Cập nhật thất bại')
        setSavingNote(false)
        return
      }
    }
    setSavingNote(false)
    closeNoteModal()
    await fetchDocuments()
  }

  async function openDocument(doc: Document) {
    setSelectedDoc(doc)
    setPreviewLoading(true)
    setPreview(null)
    const res = await fetch(`/api/documents/${doc.id}/preview`)
    if (res.ok) setPreview(await res.json())
    setPreviewLoading(false)
  }

  function closePreview() {
    setSelectedDoc(null)
    setPreview(null)
  }

  async function saveMetadata() {
    if (!selectedDoc) return
    setSavingMeta(true)
    const res = await fetch(`/api/documents/${selectedDoc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: editName.trim() || selectedDoc.filename,
        description: editDescription.trim() || null,
      }),
    })
    if (res.ok) {
      setSelectedDoc(await res.json())
      await fetchDocuments()
    }
    setSavingMeta(false)
  }

  async function handleDelete(documentId: string) {
    if (!confirm('Xóa mục này? Không thể hoàn tác.')) return
    await fetch(`/api/documents/${documentId}`, { method: 'DELETE' })
    if (selectedDoc?.id === documentId) closePreview()
    await fetchDocuments()
  }

  return (
    <div className="flex h-full">
      {/* Sidebar — type filter */}
      <aside className="w-52 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Loại tài liệu</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {SIDEBAR_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTypeFilter(item.id)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                typeFilter === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-xs text-muted-foreground">{typeCounts[item.id] ?? 0}</span>
            </button>
          ))}
        </nav>
        <div className="p-2 border-t">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-2">Trạng thái</p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5"
          >
            <option value="all">Tất cả</option>
            <option value="done">Sẵn sàng</option>
            <option value="processing">Đang xử lý</option>
            <option value="pending">Chờ xử lý</option>
            <option value="failed">Lỗi</option>
          </select>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Toolbar */}
        <div className="shrink-0 border-b bg-background px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm trong kho dữ liệu..."
              className="pl-9 h-9 text-sm"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs rounded-md border border-input bg-background px-2 py-1.5 h-9"
          >
            <option value="date">Mới nhất</option>
            <option value="name">Tên A-Z</option>
          </select>
          <div className="flex rounded-md border border-input overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-muted' : 'hover:bg-muted/50'}`}
              title="Lưới"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50'}`}
              title="Danh sách"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowUploadPanel((v) => !v)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Upload
          </Button>
          <Button size="sm" onClick={openCreateNoteModal}>
            <Plus className="h-4 w-4 mr-1.5" />
            Ghi chú
          </Button>
        </div>

        {showUploadPanel && (
          <div className="shrink-0 border-b bg-muted/30 px-4 py-3">
            <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3 max-w-2xl">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Chọn file</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="mt-1 w-full text-sm"
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs">Mô tả (tuỳ chọn)</Label>
                <Input
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Mô tả ngắn..."
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <Button type="submit" size="sm" disabled={uploading}>
                {uploading ? 'Đang upload...' : 'Tải lên'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowUploadPanel(false)}>
                Đóng
              </Button>
            </form>
            {uploadError && <p className="text-sm text-destructive mt-2">{uploadError}</p>}
          </div>
        )}

        {/* File area + preview split */}
        <div className="flex-1 flex min-h-0">
          <div className={`flex-1 min-h-0 overflow-y-auto p-4 ${selectedDoc ? 'border-r' : ''}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {TYPE_LABELS[typeFilter]} · {filteredDocs.length} mục
              </h2>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <File className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm">Không có tài liệu nào</p>
                <p className="text-xs mt-1">Thử đổi bộ lọc hoặc upload file mới</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredDocs.map((doc) => (
                  <DriveGridItem
                    key={doc.id}
                    doc={doc}
                    selected={selectedDoc?.id === doc.id}
                    onOpen={() => openDocument(doc)}
                    onEdit={doc.file_type === 'note' ? () => openEditNoteModal(doc) : undefined}
                    onDelete={() => handleDelete(doc.id)}
                    fileIcon={<FileIcon type={doc.file_type} />}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredDocs.map((doc) => (
                  <DriveListItem
                    key={doc.id}
                    doc={doc}
                    selected={selectedDoc?.id === doc.id}
                    onOpen={() => openDocument(doc)}
                    onEdit={doc.file_type === 'note' ? () => openEditNoteModal(doc) : undefined}
                    onDelete={() => handleDelete(doc.id)}
                    fileIcon={<FileIcon type={doc.file_type} size="sm" />}
                    formatBytes={formatBytes}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview panel — fixed right */}
          {selectedDoc && (
            <DocumentPreviewPanel
              doc={selectedDoc}
              preview={preview}
              previewLoading={previewLoading}
              editName={editName}
              editDescription={editDescription}
              savingMeta={savingMeta}
              typeLabels={TYPE_LABELS}
              fileIcon={<FileIcon type={selectedDoc.file_type} />}
              formatBytes={formatBytes}
              onClose={closePreview}
              onEditName={setEditName}
              onEditDescription={setEditDescription}
              onSaveMetadata={saveMetadata}
              onEditNote={
                selectedDoc.file_type === 'note'
                  ? () => openEditNoteModal(selectedDoc)
                  : undefined
              }
              onDelete={() => handleDelete(selectedDoc.id)}
            />
          )}
        </div>
      </div>

      {noteModal && (
        <NoteModal
          mode={noteModal.mode}
          doc={noteModal.doc}
          title={noteTitle}
          content={noteContent}
          saving={savingNote}
          error={noteError}
          onTitleChange={setNoteTitle}
          onContentChange={setNoteContent}
          onSave={saveNote}
          onClose={closeNoteModal}
        />
      )}
    </div>
  )
}
