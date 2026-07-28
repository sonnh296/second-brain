'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useChat } from 'ai/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MarkdownContent } from '@/components/markdown-content'
import { TypingIndicator } from '@/components/typing-indicator'
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, type ChatModelId } from '@/lib/ai/models'
import { isImageType } from '@/lib/upload/file-types'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type {
  ChatSession,
  CitedSource,
  MessageAttachmentMeta,
  PendingChatAction,
} from '@/lib/db/types'

const DRAFT_SESSION_ID = '__draft__'

function createDraftSession(): ChatSession {
  return {
    id: DRAFT_SESSION_ID,
    user_id: '',
    title: 'Cuộc trò chuyện mới',
    created_at: new Date().toISOString(),
  }
}

function isDraftSession(session: ChatSession | null): boolean {
  return !!session && session.id === DRAFT_SESSION_ID
}

// ─── Image Preview Modal ──────────────────────────────────────────────────────
type PreviewModal =
  | { open: false }
  | { open: true; src: string; filename: string; attachmentId?: string }

function ImagePreviewModal({
  modal,
  onClose,
}: {
  modal: PreviewModal
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  if (!modal.open) return null

  async function saveToLibrary() {
    if (!modal.open || !modal.attachmentId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/chat/attachments/${modal.attachmentId}/save-to-library`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      setSaveMessage(
        res.ok ? `Đã lưu "${data.filename}" vào kho tri thức` : (data.error ?? 'Không lưu được')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={modal.src}
          alt={modal.filename}
          className="max-h-[80vh] sm:max-h-[85vh] max-w-full mx-auto object-contain bg-background"
        />
        <div className="absolute top-2 right-2 flex gap-2 flex-wrap justify-end">
          {modal.attachmentId && (
            <button
              className="rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur hover:bg-background transition-colors disabled:opacity-50"
              disabled={saving}
              onClick={(e) => {
                e.stopPropagation()
                void saveToLibrary()
              }}
            >
              {saving ? 'Đang lưu…' : '💾 Lưu vào kho'}
            </button>
          )}
          <a
            href={modal.src}
            download={modal.filename}
            className="rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur hover:bg-background transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ Tải về
          </a>
          <button
            className="rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur hover:bg-background transition-colors"
            onClick={onClose}
          >
            ✕ Đóng
          </button>
        </div>
        <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-4 py-1.5 text-xs text-white truncate">
          {saveMessage ?? modal.filename}
        </p>
      </div>
    </div>
  )
}

// ─── Source Badge ─────────────────────────────────────────────────────────────
function SourceBadge({
  src,
  onImageClick,
}: {
  src: CitedSource
  onImageClick: (src: CitedSource) => void
}) {
  const isImage = isImageType(src.file_type ?? '')
  const isNote = src.file_type === 'note'
  const isPdf = src.file_type === 'pdf'
  const hasLink = !!src.document_id
  const pageAnchor = isPdf && src.page ? `#page=${src.page}` : ''

  const handleClick = () => {
    if (!hasLink || !src.document_id) return
    if (isImage) {
      onImageClick(src)
    } else if (isNote) {
      window.open('/documents', '_blank')
    } else {
      window.open(`/api/documents/${src.document_id}/download${pageAnchor}`, '_blank')
    }
  }

  const title = !hasLink
    ? undefined
    : isImage
      ? 'Xem ảnh'
      : isNote
        ? 'Mở ghi chú'
        : isPdf && src.page
          ? `Mở trang ${src.page} trong tab mới`
          : 'Mở tài liệu trong tab mới'

  return (
    <Badge
      variant="outline"
      className={`text-xs gap-1 select-none ${
        hasLink
          ? 'cursor-pointer hover:bg-accent hover:border-accent-foreground/30 transition-colors'
          : 'opacity-60'
      }`}
      onClick={hasLink ? handleClick : undefined}
      title={title}
    >
      <span>{isImage ? '🖼️' : isNote ? '📝' : '📄'}</span>
      <span className="max-w-[120px] sm:max-w-[160px] truncate">{src.filename}</span>
      {isPdf && src.page ? <span className="opacity-60">tr.{src.page}</span> : null}
      {hasLink && <span className="opacity-40 text-[10px]">↗</span>}
    </Badge>
  )
}

// ─── Pending action confirmation card ─────────────────────────────────────────
const ACTION_LABELS: Record<string, { label: string; icon: string; destructive: boolean }> = {
  update_note: { label: 'Cập nhật ghi chú', icon: '✏️', destructive: false },
  delete_note: { label: 'Xóa ghi chú', icon: '🗑️', destructive: true },
  rename_document: { label: 'Đổi tên tài liệu', icon: '🏷️', destructive: false },
  move_document: { label: 'Di chuyển tài liệu', icon: '📁', destructive: false },
  tag_document: { label: 'Gắn tag', icon: '🔖', destructive: false },
}

function PendingActionCard({
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  action: PendingChatAction
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const meta = ACTION_LABELS[action.action_type] ?? {
    label: action.action_type,
    icon: '⚙️',
    destructive: false,
  }
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 mb-2">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {meta.label}: <span className="break-words">{action.filename}</span>
          </p>
          {action.preview && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
              {action.preview}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-2 justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`px-3 py-1.5 text-xs rounded-md text-white transition-colors disabled:opacity-50 ${
            meta.destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'
          }`}
        >
          {busy ? 'Đang xử lý…' : 'Xác nhận'}
        </button>
      </div>
    </div>
  )
}

// ─── Attached Image type ──────────────────────────────────────────────────────
type AttachedImage = {
  id: string
  file: File
  previewUrl: string
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

const MODEL_STORAGE_KEY = 'second-brain-chat-model'
const CHAT_MODE_STORAGE_KEY = 'second-brain-chat-mode'

type ChatMode = 'knowledge' | 'general'

type SessionMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  cited_sources?: CitedSource[]
  attachments?: MessageAttachmentMeta[]
}

const MAX_ATTACH_IMAGES = 5
const MAX_ATTACH_BYTES = 5 * 1024 * 1024
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

function mapSessionMessages(
  messages: {
    id: string
    role: string
    content: string
    cited_sources?: CitedSource[]
    attachments?: MessageAttachmentMeta[]
  }[]
): SessionMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    cited_sources: m.cited_sources,
    attachments: m.attachments ?? [],
  }))
}

/** Claude vision xử lý tối đa ~1568px — resize trước khi gửi để giảm token/băng thông. */
const MAX_IMAGE_DIMENSION = 1568
const RESIZE_QUALITY = 0.85

async function downscaleImage(
  file: File
): Promise<{ blob: Blob; mediaType: AttachedImage['mediaType'] }> {
  // GIF giữ nguyên để không mất animation
  if (file.type === 'image/gif') {
    return { blob: file, mediaType: 'image/gif' }
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))

    // Ảnh đã nhỏ và nhẹ thì gửi nguyên bản
    if (scale === 1 && file.size <= 1024 * 1024) {
      bitmap.close()
      return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
    }
    // Nền trắng cho PNG trong suốt khi chuyển sang JPEG
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', RESIZE_QUALITY)
    )
    if (!blob) {
      return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
    }
    return { blob, mediaType: 'image/jpeg' }
  } catch {
    return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
  }
}

async function fileToAttachedImage(file: File): Promise<AttachedImage> {
  const { blob, mediaType } = await downscaleImage(file)
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(blob),
    base64,
    mediaType,
  }
}

export default function ChatPage() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL)
  const [chatMode, setChatMode] = useState<ChatMode>('knowledge')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [noContextNotice, setNoContextNotice] = useState<string | null>(null)
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [attachNotice, setAttachNotice] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<PendingChatAction[]>([])
  const [streamCitations, setStreamCitations] = useState<CitedSource[]>([])
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [previewModal, setPreviewModal] = useState<PreviewModal>({ open: false })
  const [dragOver, setDragOver] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ensuringSession, setEnsuringSession] = useState(false)
  const [chatInstanceId, setChatInstanceId] = useState(() => crypto.randomUUID())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const activeSessionRef = useRef<ChatSession | null>(null)
  const attachedImagesRef = useRef<AttachedImage[]>([])
  const creatingSessionRef = useRef(false)

  useEffect(() => {
    activeSessionRef.current = activeSession
  }, [activeSession])

  useEffect(() => {
    attachedImagesRef.current = attachedImages
  }, [attachedImages])

  useEffect(() => {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY)
    if (saved && CHAT_MODELS.some((m) => m.id === saved)) {
      setSelectedModel(saved as ChatModelId)
    }
    const savedMode = localStorage.getItem(CHAT_MODE_STORAGE_KEY)
    if (savedMode === 'knowledge' || savedMode === 'general') {
      setChatMode(savedMode)
    }
  }, [])

  const { messages, input, handleInputChange, handleSubmit, isLoading, status, setMessages, data: streamData } = useChat({
    api: '/api/chat',
    id: chatInstanceId,
    body: {
      session_id: isDraftSession(activeSession) ? undefined : activeSession?.id,
      model: selectedModel,
      mode: chatMode,
    },
    onError: (err) => {
      console.error('[chat] Error:', err)
      setChatError(err.message || 'Đã xảy ra lỗi khi chat. Vui lòng thử lại.')
    },
    onFinish: async () => {
      const session = activeSessionRef.current
      if (!session || isDraftSession(session)) return
      const res = await fetch(`/api/sessions/${session.id}`)
      if (res.ok) {
        const data = await res.json()
        const title = data.session.title as string
        setActiveSession((prev) => (prev ? { ...prev, title } : prev))
        setSessions((prev) =>
          prev.map((s) => (s.id === session.id ? { ...s, title } : s))
        )
        if (data.messages?.length) {
          setMessages(mapSessionMessages(data.messages))
        }
        setPendingActions(data.pending_actions ?? [])
        setStreamCitations([])
      }
    },
  })

  useEffect(() => {
    if (!streamData?.length) return
    for (const part of streamData) {
      const item = part as {
        no_context?: boolean
        message?: string
        pending_action?: PendingChatAction
        cited_sources?: CitedSource[]
      }
      if (item.no_context && item.message) {
        setNoContextNotice(item.message)
      }
      if (item.pending_action) {
        const action = item.pending_action
        setPendingActions((prev) =>
          prev.some((a) => a.id === action.id) ? prev : [...prev, action]
        )
      }
      if (item.cited_sources?.length) {
        setStreamCitations(item.cited_sources)
      }
    }
  }, [streamData])

  useEffect(() => {
    fetchSessions()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  async function fetchSessions() {
    setLoadingSessions(true)
    const res = await fetch('/api/sessions')
    if (res.ok) {
      const data = await res.json()
      setSessions(data)
    }
    setLoadingSessions(false)
  }

  async function loadSession(session: ChatSession) {
    setChatInstanceId(session.id)
    setActiveSession(session)
    setSidebarOpen(false)
    setActionNotice(null)
    const res = await fetch(`/api/sessions/${session.id}`)
    if (res.ok) {
      const data = await res.json()
      setMessages(mapSessionMessages(data.messages ?? []))
      setPendingActions(data.pending_actions ?? [])
    } else {
      setMessages([])
      setPendingActions([])
    }
  }

  async function resolveAction(action: PendingChatAction, confirmAction: boolean) {
    setActionBusyId(action.id)
    try {
      const res = await fetch(`/api/chat/actions/${action.id}`, {
        method: confirmAction ? 'POST' : 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setActionNotice(data.message ?? (confirmAction ? 'Đã thực hiện.' : 'Đã hủy đề xuất.'))
      } else {
        setActionNotice(data.error ?? 'Không xử lý được đề xuất.')
      }
      setPendingActions((prev) => prev.filter((a) => a.id !== action.id))
    } finally {
      setActionBusyId(null)
    }
  }

  async function createSession() {
    // Draft only — persist when the first message is sent
    setChatInstanceId(crypto.randomUUID())
    setActiveSession(createDraftSession())
    setMessages([])
    setPendingActions([])
    setActionNotice(null)
    setNoContextNotice(null)
    setStreamCitations([])
    setSidebarOpen(false)
  }

  async function ensurePersistedSession(): Promise<ChatSession | null> {
    const current = activeSessionRef.current
    if (current && !isDraftSession(current)) return current
    if (creatingSessionRef.current) return null

    creatingSessionRef.current = true
    setEnsuringSession(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) return null
      const session = (await res.json()) as ChatSession
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)])
      setActiveSession(session)
      activeSessionRef.current = session
      return session
    } finally {
      creatingSessionRef.current = false
      setEnsuringSession(false)
    }
  }

  async function renameSession(sessionId: string, title: string) {
    if (sessionId === DRAFT_SESSION_ID) return
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s)))
      if (activeSession?.id === sessionId) {
        setActiveSession((prev) => (prev ? { ...prev, title: updated.title } : prev))
      }
    }
    setRenamingId(null)
  }

  async function deleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (sessionId === DRAFT_SESSION_ID) {
      setActiveSession(null)
      setMessages([])
      return
    }
    const ok = await confirm({
      title: 'Xóa cuộc trò chuyện?',
      description: 'Toàn bộ tin nhắn trong cuộc trò chuyện này sẽ bị xóa.',
      confirmLabel: 'Xóa',
    })
    if (!ok) return
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (activeSession?.id === sessionId) {
      setActiveSession(null)
      setMessages([])
    }
  }

  function onModelChange(value: string) {
    const model = value as ChatModelId
    setSelectedModel(model)
    localStorage.setItem(MODEL_STORAGE_KEY, model)
  }

  function onModeChange(value: ChatMode) {
    setChatMode(value)
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, value)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeSession || ensuringSession || isLoading) return
    if (!input.trim() && attachedImages.length === 0) return

    setNoContextNotice(null)
    setStreamCitations([])
    setChatError(null)

    const session = await ensurePersistedSession()
    if (!session) return

    const imagePayload = attachedImages.map((img) => ({
      type: 'base64' as const,
      mediaType: img.mediaType,
      data: img.base64,
    }))
    handleSubmit(e, {
      body: {
        session_id: session.id,
        model: selectedModel,
        mode: chatMode,
        images: imagePayload,
      },
    })
    // Clear images after send
    attachedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    setAttachedImages([])
    setAttachNotice(null)
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (
        !isLoading &&
        !ensuringSession &&
        (input.trim() || attachedImages.length > 0) &&
        activeSession
      ) {
        const form = e.currentTarget.form
        if (form) form.requestSubmit()
      }
    }
  }

  const addImageFiles = useCallback(async (files: File[]) => {
    if (!files.length) return

    const skipped: string[] = []
    const accepted: AttachedImage[] = []
    const room = MAX_ATTACH_IMAGES - attachedImagesRef.current.length

    if (room <= 0) {
      setAttachNotice(`Tối đa ${MAX_ATTACH_IMAGES} ảnh mỗi tin nhắn`)
      return
    }

    for (const file of files) {
      if (accepted.length >= room) {
        skipped.push(`Đã đủ ${MAX_ATTACH_IMAGES} ảnh`)
        break
      }
      if (!ALLOWED_MEDIA.includes(file.type as (typeof ALLOWED_MEDIA)[number])) {
        skipped.push(`${file.name || 'file'}: chỉ hỗ trợ JPEG/PNG/GIF/WebP`)
        continue
      }
      if (file.size > MAX_ATTACH_BYTES) {
        skipped.push(`${file.name || 'file'}: vượt quá 5MB`)
        continue
      }
      try {
        accepted.push(await fileToAttachedImage(file))
      } catch {
        skipped.push(`${file.name || 'file'}: không đọc được`)
      }
    }

    if (accepted.length) {
      setAttachedImages((prev) => [...prev, ...accepted].slice(0, MAX_ATTACH_IMAGES))
    }
    setAttachNotice(skipped.length ? skipped.slice(0, 3).join(' · ') : null)
  }, [])

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''
      await addImageFiles(files)
    },
    [addImageFiles]
  )

  function removeImage(id: string) {
    setAttachedImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img) URL.revokeObjectURL(img.previewUrl)
      return prev.filter((i) => i.id !== id)
    })
  }

  function openCitationImage(src: CitedSource) {
    if (!src.document_id) return
    setPreviewModal({
      open: true,
      src: `/api/documents/${src.document_id}/download`,
      filename: src.filename,
    })
  }

  function openAttachmentImage(att: MessageAttachmentMeta) {
    setPreviewModal({
      open: true,
      src: `/api/chat/attachments/${att.id}/download`,
      filename: att.filename,
      attachmentId: att.id,
    })
  }

  function onComposerPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => !!f)
    if (imageFiles.length) {
      e.preventDefault()
      void addImageFiles(imageFiles)
    }
  }

  function onComposerDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  function onComposerDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  function onComposerDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    void addImageFiles(files)
  }

  function startRename(session: ChatSession, e: React.MouseEvent) {
    e.stopPropagation()
    setRenamingId(session.id)
    setRenameValue(session.title)
  }

  return (
    <div className="relative flex h-full max-w-6xl mx-auto">
      {confirmDialog}
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Đóng danh sách chat"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on md+ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-[min(18rem,85vw)] flex flex-col border-r bg-background
          transition-transform duration-200 ease-out
          md:static md:z-auto md:w-60 md:shrink-0 md:translate-x-0 md:bg-muted/20
          ${sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="shrink-0 p-3 flex items-center gap-2">
          <Button size="sm" className="flex-1" onClick={createSession}>
            + Cuộc trò chuyện mới
          </Button>
          <button
            type="button"
            className="md:hidden h-8 w-8 shrink-0 rounded-md border border-input text-sm hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <Separator />
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          <div className="space-y-1">
            {loadingSessions ? (
              <p className="text-xs text-muted-foreground px-2">Đang tải...</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2">Chưa có cuộc trò chuyện</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-1 rounded px-2 py-2 md:py-1.5 cursor-pointer text-sm ${
                    activeSession?.id === s.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => renamingId !== s.id && loadSession(s)}
                >
                  {renamingId === s.id ? (
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameSession(s.id, renameValue.trim() || s.title)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => renameSession(s.id, renameValue.trim() || s.title)}
                    />
                  ) : (
                    <>
                      <span className="truncate flex-1 text-xs">{s.title}</span>
                      <button
                        className="opacity-70 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground text-xs px-1"
                        onClick={(e) => startRename(s, e)}
                        title="Đổi tên"
                      >
                        ✎
                      </button>
                      <button
                        className="opacity-70 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs px-1"
                        onClick={(e) => deleteSession(s.id, e)}
                      >
                        ✕
                      </button>
                      <a
                        href={`/api/sessions/${s.id}/export`}
                        className="opacity-70 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground text-xs px-1"
                        title="Xuất chat"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↓
                      </a>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main chat — toolbar + scrollable messages + fixed input */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full">
        {!activeSession ? (
          <div className="relative flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 px-4">
            <button
              type="button"
              className="md:hidden absolute top-3 left-3 h-9 w-9 rounded-md border border-input bg-background hover:bg-muted text-sm"
              onClick={() => setSidebarOpen(true)}
              aria-label="Mở danh sách chat"
            >
              ☰
            </button>
            <p className="text-sm text-center">Bắt đầu cuộc trò chuyện mới</p>
            <Button size="sm" onClick={createSession}>
              + Cuộc trò chuyện mới
            </Button>
          </div>
        ) : (
          <>
            <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b bg-background">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  className="md:hidden h-9 w-9 shrink-0 rounded-md border border-input bg-background hover:bg-muted text-sm"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Mở danh sách chat"
                >
                  ☰
                </button>
                <h2 className="font-medium text-sm truncate">{activeSession.title}</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-md border border-input overflow-hidden text-xs flex-1 sm:flex-initial">
                  <button
                    type="button"
                    onClick={() => onModeChange('knowledge')}
                    className={`flex-1 sm:flex-initial px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                      chatMode === 'knowledge'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Kho tài liệu
                  </button>
                  <button
                    type="button"
                    onClick={() => onModeChange('general')}
                    className={`flex-1 sm:flex-initial px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                      chatMode === 'general'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Chat tự do
                  </button>
                </div>
                <label htmlFor="model-select" className="sr-only sm:not-sr-only text-xs text-muted-foreground">
                  Model
                </label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="flex-1 sm:flex-initial min-w-0 text-xs rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CHAT_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4">
              <div className="space-y-3 sm:space-y-4 max-w-3xl mx-auto">
                {noContextNotice && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 sm:px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
                    {noContextNotice}
                  </div>
                )}
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center pt-8 px-2">
                    Hỏi bất cứ điều gì về tài liệu đã upload.
                  </p>
                )}
                {messages.map((m, idx) => {
                  const sessionMsg = m as SessionMessage
                  const attachments = sessionMsg.attachments ?? []
                  const isLastAssistant =
                    m.role === 'assistant' && idx === messages.length - 1
                  const citedSources = sessionMsg.cited_sources?.length
                    ? sessionMsg.cited_sources
                    : isLastAssistant
                      ? streamCitations
                      : []
                  return (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[92%] sm:max-w-[85%] rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm leading-relaxed break-words ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {m.role === 'user' && attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {attachments.map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => openAttachmentImage(att)}
                              className="block overflow-hidden rounded-lg border border-primary-foreground/20"
                              title={att.filename}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/chat/attachments/${att.id}/download`}
                                alt={att.filename}
                                className="h-16 w-16 sm:h-20 sm:w-20 object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      {m.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      ) : (
                        <MarkdownContent content={m.content} />
                      )}
                      {m.role === 'assistant' && citedSources.length > 0 ? (
                        <div className="mt-2 pt-2 border-t border-border/40">
                          <p className="text-xs text-muted-foreground mb-1">Nguồn liên quan:</p>
                          <div className="flex flex-wrap gap-1">
                            {citedSources.map((src, i) => (
                              <SourceBadge
                                key={`${src.filename}-${src.chunk_index}-${i}`}
                                src={src}
                                onImageClick={openCitationImage}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  )
                })}
                {status === 'submitted' && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="shrink-0 border-t bg-background px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
              <form
                onSubmit={onSubmit}
                className={`max-w-3xl mx-auto rounded-lg transition-colors ${
                  dragOver ? 'ring-2 ring-primary/50 bg-primary/5' : ''
                }`}
                onDragOver={onComposerDragOver}
                onDragLeave={onComposerDragLeave}
                onDrop={onComposerDrop}
              >
                {pendingActions.map((action) => (
                  <PendingActionCard
                    key={action.id}
                    action={action}
                    busy={actionBusyId === action.id}
                    onConfirm={() => resolveAction(action, true)}
                    onCancel={() => resolveAction(action, false)}
                  />
                ))}
                {chatError && (
                  <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5">
                    <p className="text-xs text-destructive">{chatError}</p>
                    <button
                      type="button"
                      className="text-xs text-destructive/80 hover:text-destructive"
                      onClick={() => setChatError(null)}
                      aria-label="Đóng lỗi"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {actionNotice && (
                  <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5">
                    <p className="text-xs text-muted-foreground">{actionNotice}</p>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setActionNotice(null)}
                      aria-label="Đóng thông báo"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {attachNotice && (
                  <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">{attachNotice}</p>
                )}
                {attachedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {attachedImages.map((img) => (
                      <div key={img.id} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl}
                          alt={img.file.name}
                          className="h-14 w-14 sm:h-16 sm:w-16 object-cover rounded-lg border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs leading-none opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          aria-label="Xóa ảnh"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 sm:gap-3 items-end">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Textarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={onInputKeyDown}
                    onPaste={onComposerPaste}
                    placeholder={
                      chatMode === 'knowledge'
                        ? 'Hỏi về tài liệu… (Enter gửi)'
                        : 'Chat tự do… (Enter gửi)'
                    }
                    disabled={isLoading}
                    rows={2}
                    className="flex-1 min-h-[72px] sm:min-h-[88px] text-base leading-relaxed resize-none"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={isLoading || attachedImages.length >= MAX_ATTACH_IMAGES}
                      onClick={() => fileInputRef.current?.click()}
                      title={
                        attachedImages.length >= MAX_ATTACH_IMAGES
                          ? `Tối đa ${MAX_ATTACH_IMAGES} ảnh`
                          : 'Đính kèm ảnh'
                      }
                      className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-lg"
                    >
                      📎
                    </button>
                    <Button
                      type="submit"
                      disabled={
                        isLoading ||
                        ensuringSession ||
                        (!input.trim() && attachedImages.length === 0)
                      }
                      className="h-10 sm:h-11 px-3 sm:px-5 shrink-0"
                    >
                      {isLoading || ensuringSession ? (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:300ms]" />
                        </span>
                      ) : (
                        'Gửi'
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
      <ImagePreviewModal
        key={previewModal.open ? previewModal.src : 'closed'}
        modal={previewModal}
        onClose={() => setPreviewModal({ open: false })}
      />
    </div>
  )
}
