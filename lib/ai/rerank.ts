import type { SearchResult } from '../vector'
import { logger } from '../logger'

export interface RetrievedSource {
  filename: string
  chunk_index: number
  chunk_text: string
  score: number
  document_id: string
}

const RERANK_ENABLED = process.env.RERANK_ENABLED === 'true'
const RERANK_TOP_N = Number(process.env.RERANK_TOP_N ?? 5)
const RERANK_CANDIDATES = Number(process.env.RERANK_CANDIDATES ?? 20)

/**
 * Re-rank retrieved chunks using Cohere rerank API.
 * Falls back to score-sorted top-N when disabled or on error.
 */
export async function rerankChunks(
  query: string,
  chunks: SearchResult[],
  resolveFilename: (r: SearchResult) => string
): Promise<RetrievedSource[]> {
  const mapped: RetrievedSource[] = chunks.map((r) => ({
    filename: resolveFilename(r),
    chunk_index: r.payload.chunk_index,
    chunk_text: r.payload.chunk_text,
    score: r.score,
    document_id: r.payload.document_id,
  }))

  if (!RERANK_ENABLED || !process.env.COHERE_API_KEY || mapped.length === 0) {
    return mapped.slice(0, RERANK_TOP_N)
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
        top_n: Math.min(RERANK_TOP_N, mapped.length),
      }),
    })

    if (!res.ok) {
      logger.warn('Cohere rerank API error', { status: res.status })
      return mapped.slice(0, RERANK_TOP_N)
    }

    const data = (await res.json()) as {
      results: { index: number; relevance_score: number }[]
    }

    return data.results.map((r) => ({
      ...mapped[r.index],
      score: r.relevance_score,
    }))
  } catch (err) {
    logger.warn('Cohere rerank failed', { err })
    return mapped.slice(0, RERANK_TOP_N)
  }
}

export { RERANK_CANDIDATES, RERANK_TOP_N }
