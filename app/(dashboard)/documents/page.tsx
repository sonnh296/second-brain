'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  Image as ImageIcon,
  Tag,
  Film,
  Music,
  Archive,
  Folder as FolderIcon,
  FolderPlus,
  ChevronLeft,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DriveGridItem, DriveListItem } from '@/components/documents/document-grid'
import { DocumentPreviewPanel } from '@/components/documents/document-preview-panel'
import { NoteModal } from '@/components/documents/note-modal'
import { FileDropzone } from '@/components/documents/file-dropzone'
import { TagManager } from '@/components/documents/tag-manager'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  FolderGridItem,
  FolderListItem,
  FolderBreadcrumb,
} from '@/components/documents/folder-items'
import { useDocumentPolling } from '@/hooks/use-document-polling'
import { TYPE_LABELS, isImageType } from '@/lib/upload/file-types'
import type { Document, Tag as TagType, Folder } from '@/lib/db/types'

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
  image_url?: string
  viewer_url?: string
  can_inline?: boolean
  download_url?: string
}

interface NoteModalState {
  mode: 'create' | 'edit'
  doc?: Document
}

const TYPE_LABELS_LOCAL = TYPE_LABELS

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
    case 'md':
    case 'csv':
    case 'json':
    case 'html':
      return <FileText className={`${cls} text-slate-500`} />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return <ImageIcon className={`${cls} text-emerald-500`} />
    case 'mp3':
    case 'wav':
      return <Music className={`${cls} text-violet-500`} />
    case 'mp4':
    case 'mov':
      return <Film className={`${cls} text-pink-500`} />
    case 'zip':
    case 'xlsx':
    case 'xls':
    case 'pptx':
    case 'ppt':
      return <Archive className={`${cls} text-orange-500`} />
    default:
      return <File className={`${cls} text-muted-foreground`} />
  }
}

export default function DocumentsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [uploadDescription, setUploadDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [tags, setTags] = useState<TagType[]>([])
  const [tagFilter, setTagFilter] = useState<string | 'all'>('all')
  const [showTagManager, setShowTagManager] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [savingTags, setSavingTags] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'Gốc' },
  ])
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [savingFolder, setSavingFolder] = useState(false)
  const [reprocessingOcr, setReprocessingOcr] = useState(false)
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [trashMode, setTrashMode] = useState(false)
  const [trashDocs, setTrashDocs] = useState<Document[]>([])
  const [trashLoading, setTrashLoading] = useState(false)

  const fetchTags = useCallback(async () => {
    const res = await fetch('/api/tags')
    if (res.ok) setTags(await res.json())
  }, [])

  const fetchAllFolders = useCallback(async () => {
    const res = await fetch('/api/folders?all=1')
    if (res.ok) setAllFolders(await res.json())
  }, [])

  const fetchFolders = useCallback(async (parentId: string | null) => {
    const q = parentId ? `?parent_id=${parentId}` : '?parent_id=root'
    const res = await fetch(`/api/folders${q}`)
    if (res.ok) setFolders(await res.json())
  }, [])

  const loadBreadcrumb = useCallback(async (folderId: string | null) => {
    if (!folderId) {
      setBreadcrumb([{ id: null, name: 'Gốc' }])
      return
    }
    const res = await fetch(`/api/folders/${folderId}`)
    if (res.ok) {
      const data = await res.json()
      setBreadcrumb([{ id: null, name: 'Gốc' }, ...data.breadcrumb])
    }
  }, [])

  const fetchDocuments = useCallback(async (folderId: string | null) => {
    const q = folderId ? `?folder_id=${folderId}` : '?folder_id=root'
    const res = await fetch(`/api/documents${q}`)
    if (res.ok) setDocuments(await res.json())
  }, [])

  const refreshFolderView = useCallback(
    async (folderId: string | null) => {
      await Promise.all([
        fetchFolders(folderId),
        fetchDocuments(folderId),
        loadBreadcrumb(folderId),
        fetchAllFolders(),
      ])
    },
    [fetchFolders, fetchDocuments, loadBreadcrumb, fetchAllFolders]
  )

  useEffect(() => {
    Promise.all([refreshFolderView(currentFolderId), fetchTags()]).finally(() =>
      setLoading(false)
    )
  }, [currentFolderId, refreshFolderView, fetchTags])

  useDocumentPolling(documents, setDocuments)

  // Keep selected doc in sync with polling status updates, and refresh subtitle preview when done.
  useEffect(() => {
    if (!selectedDoc) return
    const latest = documents.find((d) => d.id === selectedDoc.id)
    if (!latest) return

    if (
      latest.status !== selectedDoc.status ||
      latest.chunk_count !== selectedDoc.chunk_count ||
      latest.error_message !== selectedDoc.error_message
    ) {
      setSelectedDoc(latest)
      if (latest.status === 'done' || latest.status === 'failed') {
        fetch(`/api/documents/${latest.id}/preview`).then(async (res) => {
          if (res.ok) setPreview(await res.json())
        })
      }
    }
  }, [documents, selectedDoc])

  function navigateToFolder(folderId: string | null) {
    setCurrentFolderId(folderId)
    closePreview()
    setLoading(true)
  }

  async function createFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim(), parent_id: currentFolderId }),
    })
    setCreatingFolder(false)
    if (res.ok) {
      setNewFolderName('')
      setShowNewFolder(false)
      await refreshFolderView(currentFolderId)
    }
  }

  async function deleteFolder(folderId: string) {
    const ok = await confirm({
      title: 'Xóa thư mục?',
      description: 'Tài liệu bên trong sẽ chuyển về thư mục gốc.',
      confirmLabel: 'Xóa thư mục',
    })
    if (!ok) return
    await fetch(`/api/folders/${folderId}`, { method: 'DELETE' })
    if (currentFolderId === folderId) navigateToFolder(null)
    else await refreshFolderView(currentFolderId)
  }

  useEffect(() => {
    if (selectedDoc) {
      setEditName(selectedDoc.filename)
      setEditDescription(selectedDoc.description ?? '')
      setSelectedTagIds(selectedDoc.tags?.map((t) => t.id) ?? [])
      setSelectedFolderId(selectedDoc.folder_id ?? null)
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
    if (tagFilter !== 'all') {
      result = result.filter((d) => d.tags?.some((t) => t.id === tagFilter))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          d.filename.toLowerCase().includes(q) ||
          (d.description?.toLowerCase().includes(q) ?? false) ||
          (d.tags?.some((t) => t.name.toLowerCase().includes(q)) ?? false)
      )
    }
    result.sort((a, b) => {
      if (sortBy === 'name') return a.filename.localeCompare(b.filename, 'vi')
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return result
  }, [documents, typeFilter, statusFilter, tagFilter, searchQuery, sortBy])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length }
    for (const d of documents) {
      counts[d.file_type] = (counts[d.file_type] ?? 0) + 1
    }
    return counts
  }, [documents])

  function putToR2WithProgress(
    url: string,
    file: File,
    contentType: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(`Tải lên kho lưu trữ thất bại (HTTP ${xhr.status})`))
      }
      xhr.onerror = () => reject(new Error('Mất kết nối khi tải lên kho lưu trữ'))
      xhr.send(file)
    })
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedFile) return
    setUploading(true)
    setUploadError('')
    setUploadProgress(0)

    try {
      // 1. Presign: create the record + get a direct-to-R2 upload URL
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          size: selectedFile.size,
          description: uploadDescription.trim() || undefined,
          folder_id: currentFolderId ?? undefined,
        }),
      })
      const presign = await presignRes.json()
      if (!presignRes.ok) {
        throw new Error(presign.error ?? 'Upload failed')
      }

      // 2. Upload straight to R2 — the file never passes through our server
      await putToR2WithProgress(
        presign.upload_url,
        selectedFile,
        presign.content_type,
        setUploadProgress
      )

      // 3. Complete: server verifies the object and queues processing (transcribe once)
      let completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: presign.document_id }),
      })
      if (!completeRes.ok) {
        // One retry — R2 head can briefly lag after a large PUT
        await new Promise((r) => setTimeout(r, 1500))
        completeRes = await fetch('/api/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: presign.document_id }),
        })
      }
      const complete = await completeRes.json()
      if (!completeRes.ok) {
        throw new Error(complete.error ?? 'Upload failed')
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      setUploading(false)
      return
    }

    setUploading(false)
    setUploadProgress(null)
    setUploadDescription('')
    setSelectedFile(null)
    setShowUploadPanel(false)
    await refreshFolderView(currentFolderId)
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
        body: JSON.stringify({
          title: noteTitle.trim(),
          content: noteContent.trim(),
          folder_id: currentFolderId,
        }),
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
    await refreshFolderView(currentFolderId)
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
      await refreshFolderView(currentFolderId)
    }
    setSavingMeta(false)
  }

  async function saveTags() {
    if (!selectedDoc) return
    setSavingTags(true)
    const res = await fetch(`/api/documents/${selectedDoc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_ids: selectedTagIds }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSelectedDoc(updated)
      await refreshFolderView(currentFolderId)
    }
    setSavingTags(false)
  }

  async function saveFolder() {
    if (!selectedDoc) return
    setSavingFolder(true)
    const res = await fetch(`/api/documents/${selectedDoc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: selectedFolderId }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSelectedDoc(updated)
      await refreshFolderView(currentFolderId)
    }
    setSavingFolder(false)
  }

  async function reprocessOcr() {
    if (!selectedDoc) return
    setReprocessingOcr(true)
    const res = await fetch(`/api/documents/${selectedDoc.id}/reprocess`, { method: 'POST' })
    if (res.ok) {
      await refreshFolderView(currentFolderId)
      if (selectedDoc) {
        const previewRes = await fetch(`/api/documents/${selectedDoc.id}/preview`)
        if (previewRes.ok) setPreview(await previewRes.json())
      }
    }
    setReprocessingOcr(false)
  }

  const fetchTrash = useCallback(async () => {
    setTrashLoading(true)
    const res = await fetch('/api/documents?trash=1')
    if (res.ok) setTrashDocs(await res.json())
    setTrashLoading(false)
  }, [])

  useEffect(() => {
    if (trashMode) void fetchTrash()
  }, [trashMode, fetchTrash])

  async function restoreDoc(documentId: string) {
    const res = await fetch(`/api/documents/${documentId}/restore`, { method: 'POST' })
    if (res.ok) {
      setTrashDocs((prev) => prev.filter((d) => d.id !== documentId))
      await refreshFolderView(currentFolderId)
    }
  }

  async function purgeDoc(documentId: string) {
    const ok = await confirm({
      title: 'Xóa vĩnh viễn?',
      description: 'Không thể khôi phục sau khi xóa.',
      confirmLabel: 'Xóa vĩnh viễn',
    })
    if (!ok) return
    const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' })
    if (res.ok) {
      setTrashDocs((prev) => prev.filter((d) => d.id !== documentId))
    }
  }

  async function handleDelete(documentId: string) {
    const ok = await confirm({
      title: 'Xóa mục này?',
      description: 'Mục sẽ được chuyển vào thùng rác.',
      confirmLabel: 'Xóa',
    })
    if (!ok) return
    await fetch(`/api/documents/${documentId}`, { method: 'DELETE' })
    if (selectedDoc?.id === documentId) closePreview()
    await refreshFolderView(currentFolderId)
  }

  return (
    <div className="relative flex h-full">
      {confirmDialog}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Đóng bộ lọc"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-[min(16rem,85vw)] border-r bg-background flex flex-col
          transition-transform duration-200 ease-out
          md:static md:z-auto md:w-52 md:shrink-0 md:translate-x-0 md:bg-muted/20
          ${sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Loại tài liệu</p>
          <button
            type="button"
            className="md:hidden h-7 w-7 rounded-md border border-input text-xs hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {SIDEBAR_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTypeFilter(item.id)
                setSidebarOpen(false)
              }}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
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
        <div className="p-2 border-t space-y-2">
          <div className="flex items-center justify-between px-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tag</p>
            <button
              type="button"
              onClick={() => setShowTagManager(true)}
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              Quản lý
            </button>
          </div>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setTagFilter('all')
                setSidebarOpen(false)
              }}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                tagFilter === 'all' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              Tất cả tag
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  setTagFilter(tag.id)
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                  tagFilter === tag.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                }`}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="truncate">{tag.name}</span>
              </button>
            ))}
          </div>
        </div>
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
        <div className="p-2 border-t">
          <button
            type="button"
            onClick={() => {
              setTrashMode((v) => !v)
              setSidebarOpen(false)
            }}
            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
              trashMode ? 'bg-destructive/10 text-destructive font-medium' : 'text-foreground hover:bg-muted'
            }`}
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1 text-left">Thùng rác</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full">
        {/* Toolbar */}
        <div className="shrink-0 border-b bg-background px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="md:hidden h-9 w-9 shrink-0 rounded-md border border-input bg-background hover:bg-muted text-sm"
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở bộ lọc"
          >
            ☰
          </button>
          {currentFolderId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2"
              onClick={() => {
                const parent = breadcrumb.length > 2 ? breadcrumb[breadcrumb.length - 2].id : null
                navigateToFolder(parent)
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <FolderBreadcrumb items={breadcrumb} onNavigate={navigateToFolder} />
          <div className="relative flex-1 min-w-[140px] sm:min-w-[160px] max-w-md">
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
              className={`p-2 cursor-pointer ${viewMode === 'grid' ? 'bg-muted' : 'hover:bg-muted/50'}`}
              title="Lưới"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2 cursor-pointer ${viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50'}`}
              title="Danh sách"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowNewFolder((v) => !v)}>
            <FolderPlus className="h-4 w-4 mr-1.5" />
            Thư mục
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowUploadPanel((v) => !v)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Upload
          </Button>
          <Button size="sm" onClick={openCreateNoteModal}>
            <Plus className="h-4 w-4 mr-1.5" />
            Ghi chú
          </Button>
        </div>

        {showNewFolder && (
          <div className="shrink-0 border-b bg-muted/30 px-4 py-3 flex flex-wrap items-end gap-2 max-w-md">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Tên thư mục mới</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Tên thư mục..."
                className="mt-1 h-9 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              />
            </div>
            <Button size="sm" onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? 'Đang tạo...' : 'Tạo'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)}>
              Đóng
            </Button>
          </div>
        )}

        {showUploadPanel && (
          <div className="shrink-0 border-b bg-muted/30 px-4 py-4">
            <form onSubmit={handleUpload} className="flex w-full flex-col gap-4">
              <FileDropzone
                disabled={uploading}
                selectedFile={selectedFile}
                onFileSelect={setSelectedFile}
              />
              <div className="w-full">
                <Label className="text-xs">Mô tả (tuỳ chọn)</Label>
                <Textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Thêm mô tả ngắn để dễ tìm lại tài liệu sau này..."
                  rows={2}
                  className="mt-1.5 w-full resize-y text-sm min-h-[4.5rem]"
                />
              </div>
              {uploading && uploadProgress !== null && (
                <div className="w-full">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{uploadProgress < 100 ? 'Đang tải lên...' : 'Đang hoàn tất...'}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={uploading || !selectedFile}>
                  {uploading ? 'Đang upload...' : 'Tải lên'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowUploadPanel(false)
                    setSelectedFile(null)
                    setUploadDescription('')
                    setUploadError('')
                  }}
                >
                  Đóng
                </Button>
              </div>
            </form>
            {uploadError && <p className="text-sm text-destructive mt-2">{uploadError}</p>}
          </div>
        )}

        {/* File area + preview split */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          <div
            className={`flex-1 min-h-0 min-w-0 overflow-y-auto p-3 sm:p-4 ${
              selectedDoc ? 'hidden sm:block' : ''
            }`}
          >
            {trashMode ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Thùng rác · {trashDocs.length} mục
                  </h2>
                  <p className="text-xs text-muted-foreground">Tự xóa vĩnh viễn sau 30 ngày</p>
                </div>
                {trashLoading ? (
                  <p className="text-sm text-muted-foreground">Đang tải...</p>
                ) : trashDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Trash2 className="h-12 w-12 mb-3 opacity-40" />
                    <p className="text-sm">Thùng rác trống</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {trashDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <FileIcon type={doc.file_type} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{doc.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            Đã xóa{' '}
                            {doc.deleted_at
                              ? new Date(doc.deleted_at).toLocaleDateString('vi-VN')
                              : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => restoreDoc(doc.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Khôi phục
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => purgeDoc(doc.id)}
                        >
                          Xóa vĩnh viễn
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
            <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {breadcrumb[breadcrumb.length - 1]?.name ?? 'Gốc'} · {folders.length} thư mục ·{' '}
                {filteredDocs.length} tài liệu
              </h2>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : folders.length === 0 && filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderIcon className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm">Thư mục trống</p>
                <p className="text-xs mt-1">Tạo thư mục hoặc upload file mới</p>
              </div>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-4">
                    {folders.map((folder) => (
                      <FolderGridItem
                        key={folder.id}
                        folder={folder}
                        onOpen={() => navigateToFolder(folder.id)}
                        onDelete={() => deleteFolder(folder.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 mb-4">
                    {folders.map((folder) => (
                      <FolderListItem
                        key={folder.id}
                        folder={folder}
                        onOpen={() => navigateToFolder(folder.id)}
                        onDelete={() => deleteFolder(folder.id)}
                      />
                    ))}
                  </div>
                )}

                {filteredDocs.length === 0 ? (
                  folders.length > 0 ? null : (
                    <p className="text-sm text-muted-foreground">Không có tài liệu</p>
                  )
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
              </>
            )}
            </>
            )}
          </div>

          {/* Preview panel — full screen on mobile */}
          {selectedDoc && (
            <div className="absolute inset-0 z-20 sm:static sm:z-auto flex min-h-0 bg-background">
            <DocumentPreviewPanel
              doc={selectedDoc}
              preview={preview}
              previewLoading={previewLoading}
              editName={editName}
              editDescription={editDescription}
              savingMeta={savingMeta}
              typeLabels={TYPE_LABELS_LOCAL}
              fileIcon={<FileIcon type={selectedDoc.file_type} />}
              formatBytes={formatBytes}
              allTags={tags}
              allFolders={allFolders}
              selectedTagIds={selectedTagIds}
              selectedFolderId={selectedFolderId}
              savingTags={savingTags}
              savingFolder={savingFolder}
              onClose={closePreview}
              onEditName={setEditName}
              onEditDescription={setEditDescription}
              onSaveMetadata={saveMetadata}
              onTagIdsChange={setSelectedTagIds}
              onSaveTags={saveTags}
              onFolderChange={setSelectedFolderId}
              onSaveFolder={saveFolder}
              onReprocessOcr={isImageType(selectedDoc.file_type) ? reprocessOcr : undefined}
              reprocessingOcr={reprocessingOcr}
              onEditNote={
                selectedDoc.file_type === 'note'
                  ? () => openEditNoteModal(selectedDoc)
                  : undefined
              }
              onDelete={() => handleDelete(selectedDoc.id)}
            />
            </div>
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

      {showTagManager && (
        <TagManager
          tags={tags}
          onTagsChange={async () => {
            await fetchTags()
            await refreshFolderView(currentFolderId)
          }}
          onClose={() => setShowTagManager(false)}
        />
      )}
    </div>
  )
}
