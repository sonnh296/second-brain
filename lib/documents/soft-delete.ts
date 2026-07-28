import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteByDocument } from '@/lib/vector'
import { logger } from '@/lib/logger'

export type SoftDeleteResult =
  | { ok: true; already_trashed?: boolean }
  | { ok: false; error: string; status: number }

/**
 * Move a document to trash: set deleted_at and remove search indexes.
 * File in R2 is kept until permanent purge / retention cron.
 */
export async function softDeleteDocument(
  supabase: SupabaseClient,
  userId: string,
  documentId: string
): Promise<SoftDeleteResult> {
  const { data: doc } = await supabase
    .from('documents')
    .select('id, deleted_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (!doc) {
    return { ok: false, error: 'Document not found', status: 404 }
  }

  if (doc.deleted_at) {
    return { ok: true, already_trashed: true }
  }

  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('user_id', userId)

  if (error) {
    logger.error('Soft delete failed', { err: error, documentId, userId })
    return { ok: false, error: 'Failed to move document to trash', status: 500 }
  }

  try {
    await deleteByDocument(userId, documentId)
  } catch (err) {
    logger.error('Qdrant cleanup on soft delete failed', { err, documentId, userId })
  }

  const { error: chunkErr } = await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)

  if (chunkErr) {
    logger.error('Chunk cleanup on soft delete failed', {
      err: chunkErr,
      documentId,
      userId,
    })
  }

  return { ok: true }
}
