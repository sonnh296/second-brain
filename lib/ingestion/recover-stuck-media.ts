import { createServiceSupabaseClient } from '../db/server'
import { enqueueIngestionJob } from '../queue'
import { isTranscribableType } from '../upload/file-types'
import { logger } from '../logger'

const STUCK_PENDING_MS = 2 * 60 * 1000

/**
 * Re-queue media that never finished transcription (e.g. /api/upload/complete
 * missed after a long direct-to-R2 upload). Safe to run periodically.
 */
export async function recoverStuckMediaTranscription(): Promise<number> {
  const supabase = createServiceSupabaseClient()
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, filename, file_type, r2_key, user_id, status, chunk_count, extracted_content, error_message, created_at')
    .in('file_type', ['mp4', 'mov', 'mp3', 'wav'])
    .in('status', ['pending', 'processing', 'done'])
    .is('deleted_at', null)

  if (error) {
    logger.error('recoverStuckMedia: query failed', { err: error.message })
    return 0
  }

  let recovered = 0
  const now = Date.now()

  for (const doc of docs ?? []) {
    if (!isTranscribableType(doc.file_type)) continue
    if (!doc.r2_key || doc.r2_key === 'pending') continue
    if (doc.error_message) continue

    const hasTranscript = Boolean(doc.extracted_content?.trim())
    const hasChunks = (doc.chunk_count ?? 0) > 0
    if (hasTranscript && hasChunks) continue

    const createdMs = new Date(doc.created_at).getTime()
    const pendingTooLong =
      doc.status === 'pending' && now - createdMs > STUCK_PENDING_MS
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
