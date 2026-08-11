import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { validateServerEnv } from '../lib/env'
import { createServiceSupabaseClient } from '../lib/db/server'
import { scrollDocumentReferences, deleteByDocument } from '../lib/vector'
import { listObjectKeys, deleteObject } from '../lib/storage'
import { getIngestionQueue } from '../lib/queue'
import { logger } from '../lib/logger'

validateServerEnv()

const fix = process.argv.includes('--fix')
const userFilter = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1]

interface OrphanReport {
  qdrant_orphans: { user_id: string; document_id: string; point_count: number }[]
  r2_orphans: string[]
  postgres_chunk_orphans: { document_id: string; chunk_count: number }[]
  done_without_vectors: { document_id: string; filename: string; chunk_count: number | null }[]
}

function isStoredFileKey(r2Key: string): boolean {
  return r2Key !== 'pending' && r2Key !== 'note' && !r2Key.startsWith('notes/')
}

function isActiveReplacement(startedAt: string | null): boolean {
  if (!startedAt) return false
  return Date.now() - new Date(startedAt).getTime() < 24 * 60 * 60 * 1000
}

async function main() {
  const supabase = createServiceSupabaseClient()

  let docQuery = supabase
    .from('documents')
    .select(
      'id, user_id, r2_key, replacement_r2_key, replacement_started_at, filename, status, chunk_count'
    )
  if (userFilter) docQuery = docQuery.eq('user_id', userFilter)

  const { data: documents, error: docErr } = await docQuery
  if (docErr) {
    console.error('Failed to load documents:', docErr.message)
    process.exit(1)
  }

  const docs = documents ?? []
  const docIds = new Set(docs.map((d) => d.id))
  const validR2Keys = new Set(
    docs
      .flatMap((d) => [
        d.r2_key,
        isActiveReplacement(d.replacement_started_at)
          ? d.replacement_r2_key
          : null,
      ])
      .filter((key): key is string => Boolean(key) && isStoredFileKey(key))
  )

  const qdrantRefs = await scrollDocumentReferences()
  const qdrantOrphans = qdrantRefs.filter(
    (ref) =>
      (!userFilter || ref.user_id === userFilter) && !docIds.has(ref.document_id)
  )

  const qdrantByDoc = new Map(
    qdrantRefs.map((ref) => [`${ref.user_id}:${ref.document_id}`, ref.point_count])
  )

  const doneWithoutVectors = docs
    .filter((d) => d.status === 'done')
    .filter((d) => (qdrantByDoc.get(`${d.user_id}:${d.id}`) ?? 0) === 0)
    .map((d) => ({
      document_id: d.id,
      filename: d.filename,
      chunk_count: d.chunk_count,
    }))

  const { data: allChunks, error: chunkErr } = await supabase
    .from('document_chunks')
    .select('document_id')

  if (chunkErr) {
    console.error('Failed to load document_chunks:', chunkErr.message)
    process.exit(1)
  }

  const orphanCounts = new Map<string, number>()
  for (const row of allChunks ?? []) {
    if (!docIds.has(row.document_id)) {
      orphanCounts.set(row.document_id, (orphanCounts.get(row.document_id) ?? 0) + 1)
    }
  }
  const postgresChunkOrphans = [...orphanCounts.entries()].map(
    ([document_id, chunk_count]) => ({ document_id, chunk_count })
  )

  const r2Keys = await listObjectKeys(userFilter ? `${userFilter}/` : undefined)
  const r2Orphans = r2Keys.filter((key) => !validR2Keys.has(key))

  const report: OrphanReport = {
    qdrant_orphans: qdrantOrphans,
    r2_orphans: r2Orphans,
    postgres_chunk_orphans: postgresChunkOrphans,
    done_without_vectors: doneWithoutVectors,
  }

  printReport(report, fix)

  if (!fix) {
    console.log('\nDry run only. Re-run with --fix to delete orphans.')
    await getIngestionQueue().close()
    return
  }

  let fixed = 0

  for (const orphan of qdrantOrphans) {
    await deleteByDocument(orphan.user_id, orphan.document_id)
    logger.info('Removed orphan Qdrant vectors', orphan)
    fixed += 1
  }

  for (const key of r2Orphans) {
    await deleteObject(key)
    logger.info('Removed orphan R2 object', { key })
    fixed += 1
  }

  for (const orphan of postgresChunkOrphans) {
    await supabase.from('document_chunks').delete().eq('document_id', orphan.document_id)
    logger.info('Removed orphan Postgres chunks', orphan)
    fixed += 1
  }

  console.log(`\nFixed ${fixed} orphan resource group(s).`)
  if (doneWithoutVectors.length > 0) {
    console.log(
      `${doneWithoutVectors.length} done document(s) without vectors — run npm run retry-pending or re-upload.`
    )
  }

  await getIngestionQueue().close()
}

function printReport(report: OrphanReport, fix: boolean) {
  console.log(`Orphan scan ${fix ? '(FIX mode)' : '(dry run)'}`)
  console.log('--- Qdrant orphans (document deleted in Postgres) ---')
  if (!report.qdrant_orphans.length) console.log('  none')
  for (const o of report.qdrant_orphans) {
    console.log(`  ${o.document_id} user=${o.user_id} points=${o.point_count}`)
  }

  console.log('--- R2 orphans (object not referenced by documents) ---')
  if (!report.r2_orphans.length) console.log('  none')
  for (const key of report.r2_orphans.slice(0, 50)) {
    console.log(`  ${key}`)
  }
  if (report.r2_orphans.length > 50) {
    console.log(`  ... and ${report.r2_orphans.length - 50} more`)
  }

  console.log('--- Postgres chunk orphans ---')
  if (!report.postgres_chunk_orphans.length) console.log('  none')
  for (const o of report.postgres_chunk_orphans) {
    console.log(`  ${o.document_id} chunks=${o.chunk_count}`)
  }

  console.log('--- Done documents without Qdrant vectors ---')
  if (!report.done_without_vectors.length) console.log('  none')
  for (const d of report.done_without_vectors) {
    console.log(`  ${d.document_id} ${d.filename} chunk_count=${d.chunk_count}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
