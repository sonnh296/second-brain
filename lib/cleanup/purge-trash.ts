import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteObject } from '../storage'
import { deleteByDocument } from '../vector'
import { logger } from '../logger'

const TRASH_RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS ?? 30)
const PURGE_BATCH_SIZE = 50

function isStoredFileKey(r2Key: string): boolean {
  return r2Key !== 'pending' && r2Key !== 'note' && !r2Key.startsWith('notes/')
}

/**
 * Permanently delete documents that have been in trash longer than the
 * retention window. Runs with the service-role client (worker context).
 */
export async function purgeExpiredTrash(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: expired, error } = await supabase
    .from('documents')
    .select('id, user_id, r2_key, filename')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .limit(PURGE_BATCH_SIZE)

  if (error) {
    logger.error('Trash purge: query failed', { err: error })
    return 0
  }
  if (!expired?.length) return 0

  let purged = 0
  for (const doc of expired) {
    try {
      await deleteByDocument(doc.user_id, doc.id)
    } catch (err) {
      logger.error('Trash purge: Qdrant deletion failed', { err, documentId: doc.id })
    }

    if (isStoredFileKey(doc.r2_key)) {
      try {
        await deleteObject(doc.r2_key)
      } catch (err) {
        logger.error('Trash purge: R2 deletion failed', { err, documentId: doc.id, r2Key: doc.r2_key })
      }
    }

    const { error: pgErr } = await supabase.from('documents').delete().eq('id', doc.id)
    if (pgErr) {
      logger.error('Trash purge: Postgres deletion failed', { err: pgErr, documentId: doc.id })
      continue
    }
    purged++
  }

  logger.info('Trash purge completed', { purged, cutoff })
  return purged
}
