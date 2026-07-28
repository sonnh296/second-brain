import { createServiceSupabaseClient } from '../db/server'
import { enqueueIngestionJob } from '../queue'
import { isTranscribableType } from '../upload/file-types'
import { logger } from '../logger'

const STUCK_PENDING_MS = 2 * 60 * 1000
const RECOVERY_BATCH_LIMIT = 50

/**
 * Re-queue media that never finished transcription (e.g. /api/upload/complete
 * missed after a long direct-to-R2 upload). Safe to run periodically.
 */
export async function recoverStuckMediaTranscription(): Promise<number> {
  const supabase = createServiceSupabaseClient()
  const cutoffIso = new Date(Date.now() - STUCK_PENDING_MS).toISOString()

  const { data: pendingDocs, error: pendingError } = await supabase
    .from('documents')
    .select('id, filename, file_type, r2_key, user_id, status, chunk_count, extracted_content, error_message, created_at')
    .in('file_type', ['mp4', 'mov', 'mp3', 'wav'])
    .eq('status', 'pending')
    .is('deleted_at', null)
    .is('error_message', null)
    .lt('created_at', cutoffIso)
    .limit(RECOVERY_BATCH_LIMIT)

  if (pendingError) {
    logger.error('recoverStuckMedia: pending query failed', { err: pendingError.message })
    return 0
  }

  const { data: doneDocs, error: doneError } = await supabase
    .from('documents')
    .select('id, filename, file_type, r2_key, user_id, status, chunk_count, extracted_content, error_message, created_at')
    .in('file_type', ['mp4', 'mov', 'mp3', 'wav'])
    .eq('status', 'done')
    .is('deleted_at', null)
    .is('error_message', null)
    .is('extracted_content', null)
    .limit(RECOVERY_BATCH_LIMIT)

  if (doneError) {
    logger.error('recoverStuckMedia: done query failed', { err: doneError.message })
    return 0
  }

  const docs = [...(pendingDocs ?? []), ...(doneDocs ?? [])]

  let recovered = 0
  for (const doc of docs ?? []) {
    if (!isTranscribableType(doc.file_type)) continue
    if (!doc.r2_key || doc.r2_key === 'pending') continue
    if (doc.error_message) continue

    const hasTranscript = Boolean(doc.extracted_content?.trim())
    const hasChunks = (doc.chunk_count ?? 0) > 0
    if (hasTranscript && hasChunks) continue

    const pendingTooLong = doc.status === 'pending'
    const doneWithoutSubtitles =
      doc.status === 'done' && !hasTranscript && !hasChunks

    if (!pendingTooLong && !doneWithoutSubtitles) continue

    try {
      await supabase
        .from('documents')
        .update({
          status: 'pending',
          chunk_count: null,
          error_message: null,
          extracted_content: null,
          content_hash: null,
        })
        .eq('id', doc.id)

      await enqueueIngestionJob(
        {
          document_id: doc.id,
          r2_key: doc.r2_key,
          file_type: doc.file_type,
          user_id: doc.user_id,
        },
        { force: true }
      )

      recovered += 1
      logger.info('Recovered stuck media transcription', {
        documentId: doc.id,
        filename: doc.filename,
        previousStatus: doc.status,
        reason: pendingTooLong ? 'pending_timeout' : 'done_without_subtitles',
      })
    } catch (err) {
      logger.error('recoverStuckMedia: failed to requeue', {
        err,
        documentId: doc.id,
      })
    }
  }

  return recovered
}
