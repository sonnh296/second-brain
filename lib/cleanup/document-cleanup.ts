import { deleteObject } from '../storage'
import { deleteByDocument } from '../vector'
import { logger } from '../logger'
import type { DocumentCleanupJobData } from '../queue'
import { documentThumbnailKey } from '../storage/thumbnail-key'

function isStoredFileKey(r2Key: string): boolean {
  return r2Key !== 'pending' && r2Key !== 'note' && !r2Key.startsWith('notes/')
}

/**
 * Idempotent cleanup of Qdrant vectors and R2 objects for a deleted document.
 * Safe to retry — external stores may already be empty.
 */
export async function runDocumentCleanup(data: DocumentCleanupJobData): Promise<void> {
  const { user_id, document_id, r2_key, steps } = data
  const failures: string[] = []

  const needsQdrant = steps.includes('qdrant')
  const needsR2 = steps.includes('r2')

  if (needsQdrant) {
    try {
      await deleteByDocument(user_id, document_id)
      logger.info('Document cleanup: Qdrant vectors removed', { documentId: document_id, userId: user_id })
    } catch (err) {
      logger.error('Document cleanup: Qdrant deletion failed', {
        err,
        documentId: document_id,
        userId: user_id,
      })
      failures.push('qdrant')
    }
  }

  if (needsR2 && isStoredFileKey(r2_key)) {
    try {
      await deleteObject(r2_key)
      logger.info('Document cleanup: R2 object removed', {
        documentId: document_id,
        userId: user_id,
        r2Key: r2_key,
      })
    } catch (err) {
      logger.error('Document cleanup: R2 deletion failed', {
        err,
        documentId: document_id,
        userId: user_id,
        r2Key: r2_key,
      })
      failures.push('r2')
    }
  }

  await deleteObject(documentThumbnailKey(user_id, document_id)).catch(() => {})

  if (failures.length > 0) {
    throw new Error(`Document cleanup incomplete: ${failures.join(', ')}`)
  }
}
