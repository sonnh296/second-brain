import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteObject } from '@/lib/storage'
import { logger } from '@/lib/logger'

export async function cleanupFailedUpload(
  supabase: SupabaseClient,
  documentId: string,
  userId: string,
  r2Key?: string | null
): Promise<void> {
  if (r2Key && r2Key !== 'pending' && r2Key !== 'note' && !r2Key.startsWith('notes/')) {
    try {
      await deleteObject(r2Key)
    } catch (err) {
      logger.error('R2 cleanup failed after upload error', { err, documentId, userId })
    }
  }

  try {
    await supabase.from('documents').delete().eq('id', documentId).eq('user_id', userId)
  } catch (err) {
    logger.error('DB cleanup failed after upload error', { err, documentId, userId })
  }
}
