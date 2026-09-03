import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { downloadToFile } from '@/lib/storage'
import { extractTextFromImage, isOcrEnabled } from '@/lib/ingestion/ocr'
import { logger } from '@/lib/logger'

export const NOTE_IMAGE_KINDS = ['n', 'd'] as const
export type NoteImageKind = (typeof NOTE_IMAGE_KINDS)[number]

export const MAX_NOTE_IMAGE_BYTES = 10 * 1024 * 1024

export const NOTE_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

const NOTE_IMAGE_SRC_RE =
  /\/api\/notes\/images\/(n|d)\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.(?:png|jpe?g|gif|webp))/gi

const MD_IMAGE_RE =
  /!\[([^\]]*)\]\((\/api\/notes\/images\/(?:n|d)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpe?g|gif|webp))\)/gi

export function isNoteImageKind(value: string): value is NoteImageKind {
  return value === 'n' || value === 'd'
}

export function noteImageR2Key(
  userId: string,
  kind: NoteImageKind,
  scopeId: string,
  filename: string
): string {
  return `notes/${userId}/${kind}/${scopeId}/${filename}`
}

export function noteImagePublicSrc(
  kind: NoteImageKind,
  scopeId: string,
  filename: string
): string {
  return `/api/notes/images/${kind}/${scopeId}/${filename}`
}

export function noteImagesPrefix(userId: string, noteId: string): string {
  return `notes/${userId}/n/${noteId}/`
}

export function parseNoteImageSrc(
  src: string
): { kind: NoteImageKind; scopeId: string; filename: string } | null {
  const match = NOTE_IMAGE_SRC_RE.exec(src)
  NOTE_IMAGE_SRC_RE.lastIndex = 0
  if (!match) return null
  return {
    kind: match[1] as NoteImageKind,
    scopeId: match[2],
    filename: match[3],
  }
}

export function listNoteImageRefs(
  markdown: string
): Array<{ alt: string; kind: NoteImageKind; scopeId: string; filename: string }> {
  const refs: Array<{
    alt: string
    kind: NoteImageKind
    scopeId: string
    filename: string
  }> = []
  let match: RegExpExecArray | null
  MD_IMAGE_RE.lastIndex = 0
  while ((match = MD_IMAGE_RE.exec(markdown)) !== null) {
    const parsed = parseNoteImageSrc(match[2])
    if (!parsed) continue
    refs.push({ alt: match[1] || '', ...parsed })
  }
  return refs
}

/**
 * OCR every inline note image and append extracted text for RAG indexing.
 * Reuses Google Vision via extractTextFromImage (same as uploaded image docs).
 */
export async function extractOcrFromNoteImages(
  userId: string,
  markdown: string
): Promise<{ ocrText: string; imageCount: number; usableCount: number }> {
  if (!isOcrEnabled()) {
    return { ocrText: '', imageCount: 0, usableCount: 0 }
  }

  const refs = listNoteImageRefs(markdown)
  if (refs.length === 0) {
    return { ocrText: '', imageCount: 0, usableCount: 0 }
  }

  const blocks: string[] = []
  let usableCount = 0

  for (const [index, ref] of refs.entries()) {
    const key = noteImageR2Key(userId, ref.kind, ref.scopeId, ref.filename)
    const tempPath = path.join(os.tmpdir(), `note-img-${userId.slice(0, 8)}-${index}-${ref.filename}`)
    try {
      await downloadToFile(key, tempPath)
      const ocr = await extractTextFromImage(tempPath)
      if (ocr.usable && ocr.text.trim()) {
        usableCount++
        const label = ref.alt.trim() || `ảnh ${index + 1}`
        blocks.push(`--- Ảnh trong ghi chú: ${label} ---\n${ocr.text.trim()}`)
      }
    } catch (err) {
      logger.warn('Note image OCR failed', {
        err,
        userId,
        key,
        filename: ref.filename,
      })
    } finally {
      await fs.unlink(tempPath).catch(() => {})
    }
  }

  return {
    ocrText: blocks.join('\n\n'),
    imageCount: refs.length,
    usableCount,
  }
}
