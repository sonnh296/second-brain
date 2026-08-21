import type { SupabaseClient } from '@supabase/supabase-js'
import { searchChunks, type SearchResult } from '../vector'
import { logger } from '../logger'
import { loadFilenameMatchedChunks, mergeFilenameMatches } from './filename-match'

export interface HybridSearchResult {
  document_id: string
  chunk_index: number
  chunk_text: string
  filename: string
  score: number
  source: 'vector' | 'keyword' | 'both'
}

const KEYWORD_WEIGHT = 0.4
const VECTOR_WEIGHT = 0.6

export type HybridSearchOptions = {
  serviceRole?: boolean
  /** When set, only search these documents. Empty array → no results. */
  documentIds?: string[]
}

/**
 * Hybrid retrieval: Qdrant vector + Postgres FTS + filename match, fused by RRF-style scoring.
 * Filename hits are prepended so they are not dropped by the later top-N cutoff.
 */
export async function hybridSearch(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  vector: number[],
  topK: number,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  if (options.documentIds && options.documentIds.length === 0) return []

  const candidateCount = Number(process.env.RERANK_CANDIDATES ?? 20)
  const scope = options.documentIds ? { documentIds: options.documentIds } : undefined

  const [vectorResults, keywordResults, filenameResults] = await Promise.all([
    searchChunks(userId, vector, candidateCount, scope),
    keywordSearchChunks(
      supabase,
      userId,
      query,
      candidateCount,
      options.serviceRole,
      options.documentIds
    ),
    loadFilenameMatchedChunks(supabase, userId, query, scope),
  ])

  const fused = fuseResults(vectorResults, keywordResults, topK)
  return mergeFilenameMatches(fused, filenameResults, topK)
}

async function keywordSearchChunks(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit: number,
  serviceRole = false,
  documentIds?: string[]
): Promise<
  {
    document_id: string
    chunk_index: number
    chunk_text: string
    filename: string
    rank: number
  }[]
> {
  if (!query.trim()) return []
  if (documentIds && documentIds.length === 0) return []

  const rpcName = serviceRole
    ? 'search_document_chunks_internal'
    : 'search_document_chunks'

  // Fetch extra candidates when post-filtering by document scope so recall stays usable.
  const rpcLimit =
    documentIds && documentIds.length > 0 ? Math.max(limit * 5, 50) : limit

  const { data, error } = await supabase.rpc(rpcName, {
    p_user_id: userId,
    p_query: query.trim(),
    p_limit: rpcLimit,
  })

  if (error) {
    logger.warn('Keyword search failed', { err: error.message, userId })
    return []
  }

  let rows = (data ?? []) as {
    document_id: string
    chunk_index: number
    chunk_text: string
    filename: string
    rank: number
  }[]

  if (documentIds && documentIds.length > 0) {
    const allowed = new Set(documentIds)
    rows = rows.filter((r) => allowed.has(r.document_id))
  }

  return rows.slice(0, limit)
}

function fuseResults(
  vectorResults: SearchResult[],
  keywordResults: {
    document_id: string
    chunk_index: number
    chunk_text: string
    filename: string
    rank: number
  }[],
  topK: number
): SearchResult[] {
  const scores = new Map<
    string,
    { score: number; payload: SearchResult['payload']; vectorScore: number }
  >()

  vectorResults.forEach((r, i) => {
    const key = `${r.payload.document_id}:${r.payload.chunk_index}`
    const rrf = VECTOR_WEIGHT / (i + 1)
    scores.set(key, {
      score: rrf + r.score * 0.1,
      payload: r.payload,
      vectorScore: r.score,
    })
  })

  keywordResults.forEach((r, i) => {
    const key = `${r.document_id}:${r.chunk_index}`
    const rrf = KEYWORD_WEIGHT / (i + 1)
    const existing = scores.get(key)
    if (existing) {
      existing.score += rrf
    } else {
      scores.set(key, {
        score: rrf,
        payload: {
          user_id: '',
          document_id: r.document_id,
          filename: r.filename,
          chunk_index: r.chunk_index,
          chunk_text: r.chunk_text,
        },
        vectorScore: 0,
      })
    }
  })

  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, topK)
    .map(([id, v]) => ({
      point_id: id,
      score: v.vectorScore > 0 ? v.vectorScore : v.score,
      payload: v.payload,
    }))
}
