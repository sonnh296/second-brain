import type { SupabaseClient } from '@supabase/supabase-js'
import { hardDeleteDocument } from '../documents/hard-delete'
import { logger } from '../logger'

const TRASH_RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS ?? 30)
const PURGE_BATCH_SIZE = 50

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
    const result = await hardDeleteDocument(supabase, doc.user_id, {
      id: doc.id,
      r2_key: doc.r2_key,
    })
    if (!result.ok) {
      logger.error('Trash purge: hard delete failed', {
        documentId: doc.id,
        error: result.error,
        failedSteps: result.failed_steps,
      })
      continue
    }
    purged++
  }

  logger.info('Trash purge completed', { purged, cutoff })
  return purged
}
