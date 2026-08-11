import type { SearchResult } from '../vector'
import { logger } from '../logger'
import { selectContextChunks } from '../search/filename-match'

export interface RetrievedSource {
  filename: string
  chunk_index: number
  chunk_text: string
  score: number
  document_id: string
  page?: number
  matched_by_filename?: boolean
  filename_match_strong?: boolean
}

const RERANK_ENABLED = process.env.RERANK_ENABLED === 'true'
const RERANK_TOP_N = Number(process.env.RERANK_TOP_N ?? 5)
const RERANK_CANDIDATES = Number(process.env.RERANK_CANDIDATES ?? 20)
const RAG_MAX_CHUNKS = Number(process.env.RAG_MAX_CHUNKS ?? 8)

function toRetrievedSource(
  r: SearchResult,
  resolveFilename: (r: SearchResult) => string
): RetrievedSource {
  return {
    filename: resolveFilename(r),
    chunk_index: r.payload.chunk_index,
    chunk_text: r.payload.chunk_text,
    score: r.score,
    document_id: r.payload.document_id,
    page: typeof r.payload.page === 'number' ? r.payload.page : undefined,
    matched_by_filename: r.payload.matched_by_filename === true,
    filename_match_strong: r.payload.filename_match_strong === true,
  }
}

/**
 * Re-rank retrieved chunks using Cohere rerank API.
 * Falls back to filename-pin + adaptive top-N when disabled or on error.
 */
export async function rerankChunks(
  query: string,
  chunks: SearchResult[],
  resolveFilename: (r: SearchResult) => string
): Promise<RetrievedSource[]> {
  const mapped: RetrievedSource[] = chunks.map((r) => toRetrievedSource(r, resolveFilename))

  if (!RERANK_ENABLED || !process.env.COHERE_API_KEY || mapped.length === 0) {
    return selectContextChunks(mapped)
  }

  try {
    const res = await fetch('https://api.cohere.com/v1/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'rerank-v3.5',
        query,
        documents: mapped.map((m) => m.chunk_text),
        top_n: Math.min(RAG_MAX_CHUNKS, mapped.length),
      }),
    })

    if (!res.ok) {
      logger.warn('Cohere rerank API error', { status: res.status })
      return selectContextChunks(mapped)
    }

    const data = (await res.json()) as {
      results: { index: number; relevance_score: number }[]
    }

    const reranked = data.results.map((r) => ({
      ...mapped[r.index],
      score: r.relevance_score,
    }))
    const pinned = mapped.filter((m) => m.matched_by_filename)
    const rest = reranked.filter((m) => !m.matched_by_filename)
    return selectContextChunks([...pinned, ...rest])
  } catch (err) {
    logger.warn('Cohere rerank failed', { err })
    return selectContextChunks(mapped)
  }
}

export { RERANK_CANDIDATES, RERANK_TOP_N }
