import type { CitedSource, MessageAttachmentMeta } from '@/lib/db/types'

export type PreviewModal =
  | { open: false }
  | { open: true; src: string; filename: string; attachmentId?: string }

export type AttachedImage = {
  id: string
  file: File
  previewUrl: string
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export type ChatMode = 'knowledge' | 'general'

export type SessionMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  cited_sources?: CitedSource[]
  attachments?: MessageAttachmentMeta[]
}
