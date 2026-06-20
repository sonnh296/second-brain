import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { createServiceSupabaseClient } from '../lib/db/server'
import { getIngestionQueue, enqueueIngestionJob } from '../lib/queue'

async function main() {
  const supabase = createServiceSupabaseClient()
  const queue = getIngestionQueue()

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, r2_key, file_type, user_id')
    .in('status', ['pending', 'failed', 'processing'])

  if (error) {
    console.error('DB error:', error.message)
    process.exit(1)
  }

  if (!docs?.length) {
    console.log('No pending documents found.')
    process.exit(0)
  }

  for (const doc of docs) {
    await supabase
      .from('documents')
      .update({ status: 'pending', error_message: null })
      .eq('id', doc.id)

    const result = await enqueueIngestionJob(
      {
        document_id: doc.id,
        r2_key: doc.r2_key,
        file_type: doc.file_type,
        user_id: doc.user_id,
      },
      { force: true }
    )
    console.log(`Re-queued document ${doc.id} (${result})`)
  }

  await queue.close()
  console.log(`Done — re-queued ${docs.length} document(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
