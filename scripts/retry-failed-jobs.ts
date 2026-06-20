import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { Queue } from 'bullmq'
import type { IngestionJobData } from '../lib/queue'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

async function main() {
  const queue = new Queue<IngestionJobData>('ingestion', {
    connection: { url: REDIS_URL },
  })

  const failed = await queue.getFailed(0, 100)

  if (failed.length === 0) {
    console.log('No failed jobs in dead letter queue.')
    await queue.close()
    process.exit(0)
  }

  console.log(`Found ${failed.length} failed job(s). Retrying...`)

  for (const job of failed) {
    if (!job.data) continue
    await job.retry()
    console.log(`  Retried job ${job.id} — document ${job.data.document_id}`)
  }

  await queue.close()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
