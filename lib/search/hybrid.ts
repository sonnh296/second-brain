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
  options: { serviceRole?: boolean } = {}
): Promise<SearchResult[]> {
  const candidateCount = Number(process.env.RERANK_CANDIDATES ?? 20)

  const [vectorResults, keywordResults, filenameResults] = await Promise.all([
    searchChunks(userId, vector, candidateCount),
    keywordSearchChunks(supabase, userId, query, candidateCount, options.serviceRole),
    loadFilenameMatchedChunks(supabase, userId, query),
  ])

  const fused = fuseResults(vectorResults, keywordResults, topK)
  return mergeFilenameMatches(fused, filenameResults, topK)
}

async function keywordSearchChunks(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit: number,
  serviceRole = false
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

  const rpcName = serviceRole
    ? 'search_document_chunks_internal'
    : 'search_document_chunks'

  const { data, error } = await supabase.rpc(rpcName, {
    p_user_id: userId,
    p_query: query.trim(),
    p_limit: limit,
  })

  if (error) {
    logger.warn('Keyword search failed', { err: error.message, userId })
    return []
  }

  return (data ?? []) as {
    document_id: string
    chunk_index: number
    chunk_text: string
    filename: string
    rank: number
  }[]
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
