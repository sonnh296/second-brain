import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteObject, listObjectKeys } from '@/lib/storage'
import { deleteByDocument } from '@/lib/vector'
import { enqueueDocumentCleanupJob } from '@/lib/queue'
import { documentThumbnailKey } from '@/lib/storage/thumbnail-key'
import { noteImagesPrefix } from '@/lib/notes/images'
import { logger } from '@/lib/logger'

function isStoredFileKey(r2Key: string): boolean {
  return r2Key !== 'pending' && r2Key !== 'note' && !r2Key.startsWith('notes/')
}

async function deleteNoteInlineImages(userId: string, documentId: string): Promise<void> {
  const prefix = noteImagesPrefix(userId, documentId)
  const keys = await listObjectKeys(prefix)
  await Promise.all(keys.map((key) => deleteObject(key).catch(() => {})))
}

export type HardDeleteResult =
  | { ok: true; cleanup_queued?: boolean; failed_steps?: ('qdrant' | 'r2')[] }
  | { ok: false; error: string; status: number; failed_steps?: string[] }

/**
 * Permanently remove a document from Qdrant, R2, and Postgres.
 * Used by trash purge (UI + cron) — not by normal "move to trash".
 */
export async function hardDeleteDocument(
  supabase: SupabaseClient,
  userId: string,
  doc: { id: string; r2_key: string }
): Promise<HardDeleteResult> {
  const failures: ('qdrant' | 'r2')[] = []

  try {
    await deleteByDocument(userId, doc.id)
  } catch (err) {
    logger.error('Qdrant deletion failed', { err, documentId: doc.id, userId })
    failures.push('qdrant')
  }

  if (isStoredFileKey(doc.r2_key)) {
    try {
      await deleteObject(doc.r2_key)
    } catch (err) {
      logger.error('R2 deletion failed', {
        err,
        documentId: doc.id,
        userId,
        r2Key: doc.r2_key,
      })
      failures.push('r2')
    }
  }

  // Note placeholder keys (`notes/{userId}/{docId}`) plus inline images under n/{noteId}/
  if (doc.r2_key.startsWith('notes/') || doc.r2_key === 'note') {
    try {
      await deleteNoteInlineImages(userId, doc.id)
    } catch (err) {
      logger.error('Note inline image cleanup failed', {
        err,
        documentId: doc.id,
        userId,
      })
      failures.push('r2')
    }
  }

  await deleteObject(documentThumbnailKey(userId, doc.id)).catch(() => {})

  const { error: pgErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', doc.id)
    .eq('user_id', userId)

  if (pgErr) {
    logger.error('Postgres deletion failed', { err: pgErr, documentId: doc.id, userId })
    return {
      ok: false,
      error: 'Failed to delete document record',
      status: 500,
      failed_steps: [...failures, 'postgres'],
    }
  }

  if (failures.length > 0) {
    try {
      await enqueueDocumentCleanupJob({
        user_id: userId,
        document_id: doc.id,
        r2_key: doc.r2_key,
        steps: failures,
      })
    } catch (err) {
      logger.error('Failed to enqueue document cleanup job', {
        err,
        documentId: doc.id,
        userId,
        failedSteps: failures,
      })
    }

    return { ok: true, cleanup_queued: true, failed_steps: failures }
  }

  return { ok: true }
}
