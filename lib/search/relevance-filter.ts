import type { SearchResult } from '../vector'

const RAG_MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.12)
const RAG_FALLBACK_TOP_N = Number(process.env.RAG_FALLBACK_TOP_N ?? 3)

/**
 * Filter retrieved chunks by similarity score.
 * Embedding scores for short PDF chunks are often 0.10–0.25 — keep top-N fallback.
 */
export function filterRelevantChunks(chunks: SearchResult[]): SearchResult[] {
  if (chunks.length === 0) return []

  const aboveThreshold = chunks.filter((r) => r.score >= RAG_MIN_SCORE)
  if (aboveThreshold.length > 0) return aboveThreshold

  return chunks.slice(0, RAG_FALLBACK_TOP_N)
}

export { RAG_MIN_SCORE }
