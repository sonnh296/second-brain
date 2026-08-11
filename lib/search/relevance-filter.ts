import type { SearchResult } from '../vector'

const RAG_MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.12)
const RAG_FALLBACK_TOP_N = Number(process.env.RAG_FALLBACK_TOP_N ?? 3)

/**
 * Filter retrieved chunks by similarity score.
 * Embedding scores for short PDF chunks are often 0.10–0.25 — keep top-N fallback.
 */
function chunkKey(r: SearchResult): string {
  return `${r.payload.document_id}:${r.payload.chunk_index}`
}

export function filterRelevantChunks(chunks: SearchResult[]): SearchResult[] {
  if (chunks.length === 0) return []

  const filenameHits = chunks.filter((r) => r.payload.matched_by_filename === true)
  const aboveThreshold = chunks.filter((r) => r.score >= RAG_MIN_SCORE)

  if (filenameHits.length > 0 || aboveThreshold.length > 0) {
    const seen = new Set<string>()
    const merged: SearchResult[] = []
    for (const r of [...filenameHits, ...aboveThreshold]) {
      const key = chunkKey(r)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(r)
    }
    return merged
  }

  return chunks.slice(0, RAG_FALLBACK_TOP_N)
}

export { RAG_MIN_SCORE }
