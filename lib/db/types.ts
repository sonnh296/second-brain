export type DocumentStatus = 'pending' | 'processing' | 'done' | 'failed'
export type MessageRole = 'user' | 'assistant'

export interface Tag {
  id: string
  name: string
  color: string
  created_at?: string
}

export interface Folder {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  color: string
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  filename: string
  file_type: string
  r2_key: string
  file_size_bytes: number
  chunk_count: number | null
  status: DocumentStatus
  error_message: string | null
  note_content: string | null
  description: string | null
  content_hash: string | null
  extracted_content: string | null
  ocr_text: string | null
  folder_id: string | null
  deleted_at: string | null
  is_favorite?: boolean
  created_at: string
  tags?: Tag[]
}

export interface DocumentChunk {
  id: string
  document_id: string
  user_id: string
  chunk_text: string
  chunk_index: number
  qdrant_point_id: string
  /** PDF page number when known. */
  page: number | null
  created_at: string
}

export interface ChatSession {
  id: string
  user_id: string
  title: string
  created_at: string
}

export interface CitedSource {
  filename: string
  chunk_index: number
  document_id?: string
  file_type?: string
  /** PDF page number for deep-linking (#page=N). */
  page?: number
}

export interface MessageAttachment {
  id: string
  message_id: string
  user_id: string
  r2_key: string
  media_type: string
  filename: string
  byte_size: number
  created_at: string
}

/** Attachment metadata returned with chat messages (no r2_key). */
export interface MessageAttachmentMeta {
  id: string
  media_type: string
  filename: string
}

export interface Message {
  id: string
  session_id: string
  role: MessageRole
  content: string
  cited_sources: CitedSource[]
  created_at: string
  attachments?: MessageAttachmentMeta[]
}

export type ChatActionType =
  | 'create_note'
  | 'update_note'
  | 'delete_note'
  | 'restore_note'
  | 'rename_document'
  | 'move_document'
  | 'tag_document'
export type ChatActionStatus = 'pending' | 'executed' | 'cancelled' | 'failed'

export interface ChatAction {
  id: string
  user_id: string
  session_id: string
  action_type: ChatActionType
  document_id: string | null
  payload: Record<string, unknown>
  status: ChatActionStatus
  result: Record<string, unknown> | null
  created_at: string
  executed_at: string | null
}

/** Pending action shape sent to the chat UI for confirmation cards. */
export interface PendingChatAction {
  id: string
  action_type: ChatActionType
  document_id: string | null
  filename: string
  preview: string | null
}
