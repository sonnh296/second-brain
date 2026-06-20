export type DocumentStatus = 'pending' | 'processing' | 'done' | 'failed'
export type MessageRole = 'user' | 'assistant'

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
  created_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  user_id: string
  chunk_text: string
  chunk_index: number
  qdrant_point_id: string
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
}

export interface Message {
  id: string
  session_id: string
  role: MessageRole
  content: string
  cited_sources: CitedSource[]
  created_at: string
}
