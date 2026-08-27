import { config } from 'dotenv'
import { resolve } from 'path'

// Worker runs outside Next.js — must load .env.local manually
config({ path: resolve(process.cwd(), '.env.local'), override: true })

import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { runIngestionPipeline } from '../lib/ingestion/pipeline'
import { runClassroomIngestionPipeline } from '../lib/classroom/ingestion'
import { runDocumentCleanup } from '../lib/cleanup/document-cleanup'
import { purgeExpiredTrash } from '../lib/cleanup/purge-trash'
import { createServiceSupabaseClient } from '../lib/db/server'
import type { DocumentCleanupJobData, IngestionJobData } from '../lib/queue'
import { validateServerEnv } from '../lib/env'
import { initSentry } from '../lib/sentry'
import { logger } from '../lib/logger'
import { recoverStuckMediaTranscription } from '../lib/ingestion/recover-stuck-media'

validateServerEnv()
initSentry()

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// Separate ioredis for graceful shutdown — BullMQ uses its own bundled ioredis internally
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

// A small amount of parallelism keeps short text / note jobs from sitting
// behind long media transcriptions while still remaining conservative on RAM.
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2)

const ingestionWorker = new Worker<IngestionJobData>(
  'ingestion',
  async (job) => {
    const { document_id, r2_key, file_type, user_id, manual_content, classroom_id, product } =
      job.data
    logger.info('Processing ingestion job', {
      jobId: job.id,
      documentId: document_id,
      userId: user_id,
      product: product ?? 'personal',
      classroomId: classroom_id,
    })

    const filename = r2_key.split('/').pop() ?? 'unknown'

    if (product === 'classroom' && classroom_id) {
      await runClassroomIngestionPipeline(
        document_id,
        r2_key,
        file_type,
        user_id,
        classroom_id,
        filename
      )
    } else {
      await runIngestionPipeline(
        document_id,
        r2_key,
        file_type,
        user_id,
        filename,
        manual_content
      )
    }
    logger.info('Ingestion job completed', {
      jobId: job.id,
      documentId: document_id,
      userId: user_id,
    })
  },
  {
    connection: { url: REDIS_URL },
    concurrency: WORKER_CONCURRENCY,
  }
)

const cleanupWorker = new Worker<DocumentCleanupJobData>(
  'document-cleanup',
  async (job) => {
    logger.info('Processing document cleanup job', {
      jobId: job.id,
      documentId: job.data.document_id,
      userId: job.data.user_id,
      steps: job.data.steps,
    })
    await runDocumentCleanup(job.data)
    logger.info('Document cleanup job completed', {
      jobId: job.id,
      documentId: job.data.document_id,
    })
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 2,
  }
)

function attachWorkerEvents(worker: Worker, label: string) {
  worker.on('failed', (job, err) => {
    logger.error(`${label} job failed`, {
      err,
      jobId: job?.id,
      documentId: job?.data && 'document_id' in job.data ? job.data.document_id : undefined,
    })
  })

  worker.on('completed', (job) => {
    logger.info(`${label} job succeeded`, { jobId: job.id })
  })
}

attachWorkerEvents(ingestionWorker, 'Ingestion')
attachWorkerEvents(cleanupWorker, 'Document cleanup')

logger.info('Ingestion worker started')
logger.info('Document cleanup worker started')

// Periodic trash purge — hard-delete documents past retention window
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000

async function runTrashPurge() {
  try {
    const supabase = createServiceSupabaseClient()
    await purgeExpiredTrash(supabase)
  } catch (err) {
    logger.error('Trash purge run failed', { err })
  }
}

void runTrashPurge()
const purgeTimer = setInterval(() => void runTrashPurge(), PURGE_INTERVAL_MS)

// Recover media stuck without subtitles (e.g. complete missed after long R2 upload)
const RECOVER_MEDIA_INTERVAL_MS = 60 * 1000

async function runMediaRecovery() {
  try {
    const count = await recoverStuckMediaTranscription()
    if (count > 0) {
      logger.info('Media recovery pass finished', { recoveredCount: count })
    }
  } catch (err) {
    logger.error('Media recovery pass failed', { err })
  }
}

void runMediaRecovery()
const mediaRecoverTimer = setInterval(() => void runMediaRecovery(), RECOVER_MEDIA_INTERVAL_MS)

async function shutdown() {
  clearInterval(purgeTimer)
  clearInterval(mediaRecoverTimer)
  await Promise.all([ingestionWorker.close(), cleanupWorker.close()])
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down worker')
  shutdown().catch(() => process.exit(1))
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down worker')
  shutdown().catch(() => process.exit(1))
})
