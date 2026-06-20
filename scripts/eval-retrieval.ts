import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })

import { validateServerEnv } from '../lib/env'
import { createServiceSupabaseClient } from '../lib/db/server'
import { embedSingle } from '../lib/ingestion/embed'
import { hybridSearch } from '../lib/search/hybrid'
import {
  summarizeEval,
  type EvalDataset,
  type RetrievedChunkRef,
} from '../lib/eval/retrieval-metrics'

validateServerEnv()

async function main() {
  const datasetPath =
    process.argv[2] ?? resolve(process.cwd(), 'test-data/eval-retrieval.json')
  const userId = process.env.EVAL_USER_ID

  if (!userId) {
    console.error('Set EVAL_USER_ID in .env.local to the user who owns eval documents')
    process.exit(1)
  }

  const raw = readFileSync(datasetPath, 'utf8')
  const dataset = JSON.parse(raw) as EvalDataset
  const k = dataset.k ?? Number(process.env.EVAL_TOP_K ?? 5)

  if (!dataset.cases?.length) {
    console.error('Eval dataset has no cases')
    process.exit(1)
  }

  const supabase = createServiceSupabaseClient()
  const allResults: RetrievedChunkRef[][] = []

  console.log(`Evaluating ${dataset.cases.length} question(s) at k=${k} for user ${userId}`)
  console.log(`Dataset: ${datasetPath}\n`)

  for (const evalCase of dataset.cases) {
    const vector = await embedSingle(evalCase.question)
    const retrieved = await hybridSearch(
      supabase,
      userId,
      evalCase.question,
      vector,
      k,
      { serviceRole: true }
    )

    allResults.push(
      retrieved.map((r) => ({
        filename: r.payload.filename,
        chunk_text: r.payload.chunk_text,
        chunk_index: r.payload.chunk_index,
        document_id: r.payload.document_id,
        score: r.score,
      }))
    )
  }

  const summary = summarizeEval(dataset.cases, allResults, k)

  console.log('--- Retrieval eval ---')
  console.log(`Hit@${k}:        ${(summary.hit_at_k * 100).toFixed(1)}%`)
  console.log(`Precision@${k}:  ${(summary.mean_precision_at_k * 100).toFixed(1)}%`)
  console.log(`MRR:           ${summary.mrr.toFixed(3)}`)
  console.log('')

  for (const c of summary.cases) {
    const status = c.hit_at_k ? 'HIT' : 'MISS'
    console.log(`[${status}] ${c.question}`)
    console.log(`       top files: ${c.top_filenames.join(', ') || '(none)'}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
