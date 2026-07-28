import type { ChatSession, CitedSource, MessageAttachmentMeta } from '@/lib/db/types'
import type { SessionMessage } from '@/components/chat/types'

export const DRAFT_SESSION_ID = '__draft__'

export function createDraftSession(): ChatSession {
  return {
    id: DRAFT_SESSION_ID,
    user_id: '',
    title: 'Cuộc trò chuyện mới',
    created_at: new Date().toISOString(),
  }
}

export function isDraftSession(session: ChatSession | null): boolean {
  return !!session && session.id === DRAFT_SESSION_ID
}

export function mapSessionMessages(
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
