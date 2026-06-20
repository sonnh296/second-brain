import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { logger } from '../logger'

export interface IngestionJobData {
  document_id: string
  r2_key: string
  file_type: string
  user_id: string
}

export interface DocumentCleanupJobData {
  user_id: string
  document_id: string
  r2_key: string
  steps: ('qdrant' | 'r2')[]
}

export type EnqueueResult = 'queued' | 'skipped' | 'replaced'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// BullMQ bundles its own ioredis — pass the URL string to avoid version conflicts
const bullmqConnection = { url: REDIS_URL }

// Separate ioredis instance for rate limiting and other direct Redis ops
// Singleton pattern — prevent connection leaks on Next.js hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __redis: IORedis | undefined
  // eslint-disable-next-line no-var
  var __ingestionQueue: Queue<IngestionJobData> | undefined
  // eslint-disable-next-line no-var
  var __cleanupQueue: Queue<DocumentCleanupJobData> | undefined
}

export function ingestionJobId(documentId: string): string {
  return `ingest-${documentId}`
}

export function cleanupJobId(documentId: string): string {
  return `cleanup-${documentId}`
}

export function getRedis(): IORedis {
  if (!global.__redis) {
    global.__redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    })
  }
  return global.__redis
}

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!global.__ingestionQueue) {
    global.__ingestionQueue = new Queue<IngestionJobData>('ingestion', {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    })
  }
  return global.__ingestionQueue!
}

export function getCleanupQueue(): Queue<DocumentCleanupJobData> {
  if (!global.__cleanupQueue) {
    global.__cleanupQueue = new Queue<DocumentCleanupJobData>('document-cleanup', {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return global.__cleanupQueue!
}

/**
 * Enqueue retry cleanup for Qdrant/R2 after a document row was removed from Postgres.
 */
export async function enqueueDocumentCleanupJob(
  data: DocumentCleanupJobData
): Promise<EnqueueResult> {
  const queue = getCleanupQueue()
  const jobId = cleanupJobId(data.document_id)
  const existing = await queue.getJob(jobId)

  if (existing) {
    const state = await existing.getState()
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      logger.info('Document cleanup job skipped — already queued', {
        documentId: data.document_id,
        jobId,
        state,
      })
      return 'skipped'
    }
    await existing.remove()
  }

  await queue.add('cleanup', data, { jobId })

  const result: EnqueueResult = existing ? 'replaced' : 'queued'
  logger.info('Document cleanup job enqueued', {
    documentId: data.document_id,
    jobId,
    steps: data.steps,
    result,
  })
  return result
}

/**
 * Enqueue ingestion with deduplication by document_id.
 * Skips when the same document is already waiting/active unless force=true.
 */
export async function enqueueIngestionJob(
  data: IngestionJobData,
  options: { force?: boolean } = {}
): Promise<EnqueueResult> {
  const queue = getIngestionQueue()
  const jobId = ingestionJobId(data.document_id)
  const existing = await queue.getJob(jobId)

  if (existing) {
    const state = await existing.getState()
    if (
      !options.force &&
      (state === 'active' || state === 'waiting' || state === 'delayed')
    ) {
      logger.info('Ingestion job skipped — already queued', {
        documentId: data.document_id,
        jobId,
        state,
      })
      return 'skipped'
    }
    await existing.remove()
  }

  await queue.add('ingest', data, { jobId })

  const result: EnqueueResult = existing ? 'replaced' : 'queued'
  logger.info('Ingestion job enqueued', {
    documentId: data.document_id,
    jobId,
    result,
  })
  return result
}
