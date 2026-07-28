import { randomUUID } from 'node:crypto'
import {
  uploadBuffer,
  getObjectBuffer,
  chatAttachmentKey,
  deleteObject,
} from '@/lib/storage'
import { logger } from '@/lib/logger'

const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export type ChatImageInput = {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string // base64
}

export type StoredAttachment = {
  id: string
  r2_key: string
  media_type: string
  filename: string
  byte_size: number
}

/** Cap images re-sent from history to the model. */
export const HISTORY_IMAGE_CAP = Number(process.env.HISTORY_IMAGE_CAP ?? 4)
export const HISTORY_IMAGE_MESSAGE_CAP = Number(process.env.HISTORY_IMAGE_MESSAGE_CAP ?? 2)

type ImagePart = { type: 'image'; image: string; mimeType: string }
type TextPart = { type: 'text'; text: string }
export type MultimodalContent = string | Array<ImagePart | TextPart>

type HistoryRow = {
  id: string
  role: string
  content: string
  attachments?: { id: string; r2_key: string; media_type: string }[]
}

/**
 * Upload base64 chat images to R2 and return rows ready for DB insert.
 * On partial failure, already-uploaded objects are cleaned up.
 */
export async function persistChatImages(
  userId: string,
  sessionId: string,
  images: ChatImageInput[]
): Promise<StoredAttachment[]> {
  if (!images.length) return []

  const stored: StoredAttachment[] = []
  try {
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      const id = randomUUID()
      const ext = MEDIA_EXT[img.mediaType] ?? 'bin'
      const filename = `chat-image-${i + 1}.${ext}`
      const r2_key = chatAttachmentKey(userId, sessionId, id, ext)
      const buffer = Buffer.from(img.data, 'base64')
      await uploadBuffer(r2_key, buffer, img.mediaType)
      stored.push({
        id,
        r2_key,
        media_type: img.mediaType,
        filename,
        byte_size: buffer.byteLength,
      })
    }
    return stored
  } catch (err) {
    await Promise.all(
      stored.map(async (s) => {
        try {
          await deleteObject(s.r2_key)
        } catch (cleanupErr) {
          logger.error('Failed to cleanup chat attachment after upload error', {
            err: cleanupErr,
            key: s.r2_key,
          })
        }
      })
    )
    throw err
  }
}

/**
 * Rebuild chat history for the model, re-attaching images (newest first, capped).
 */
export async function buildMultimodalHistory(
  rows: HistoryRow[],
  imageCap = HISTORY_IMAGE_CAP,
  messageCap = HISTORY_IMAGE_MESSAGE_CAP
): Promise<{ role: 'user' | 'assistant'; content: MultimodalContent }[]> {
  // Only rehydrate recent image turns; older image context is expensive and rarely needed.
  const selectedIds = new Set<string>()
  let remaining = imageCap
  let remainingMessages = messageCap
  for (let i = rows.length - 1; i >= 0 && remaining > 0; i--) {
    const atts = rows[i].attachments ?? []
    if (atts.length === 0) continue
    if (remainingMessages <= 0) break
    remainingMessages--
    for (let j = atts.length - 1; j >= 0 && remaining > 0; j--) {
      selectedIds.add(atts[j].id)
      remaining--
    }
  }

  const result: { role: 'user' | 'assistant'; content: MultimodalContent }[] = []

  for (const row of rows) {
    const role = row.role as 'user' | 'assistant'
    const atts = (row.attachments ?? []).filter((a) => selectedIds.has(a.id))

    if (role !== 'user' || atts.length === 0) {
      result.push({ role, content: row.content })
      continue
    }

    const parts: Array<ImagePart | TextPart> = []
    for (const att of atts) {
      try {
        const { buffer } = await getObjectBuffer(att.r2_key)
        parts.push({
          type: 'image',
          image: buffer.toString('base64'),
          mimeType: att.media_type,
        })
      } catch (err) {
        logger.error('Failed to load chat attachment for history', {
          err,
          attachmentId: att.id,
        })
      }
    }

    parts.push({ type: 'text', text: row.content || '(Ảnh đính kèm)' })
    result.push({
      role,
      content: parts.length > 1 ? parts : row.content,
    })
  }

  return result
}
