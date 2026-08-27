import type { SupabaseClient } from '@supabase/supabase-js'
import { searchClassroomChunks, type SearchResult } from '../vector'
import { logger } from '../logger'

const KEYWORD_WEIGHT = 0.4
const VECTOR_WEIGHT = 0.6

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
  const scores = new Map<string, { result: SearchResult; score: number }>()

  vectorResults.forEach((r, i) => {
    const key = `${r.payload.document_id}:${r.payload.chunk_index}`
    const rrf = VECTOR_WEIGHT / (60 + i + 1)
    const existing = scores.get(key)
    if (existing) existing.score += rrf
    else scores.set(key, { result: r, score: rrf })
  })

  keywordResults.forEach((r, i) => {
    const key = `${r.document_id}:${r.chunk_index}`
    const rrf = KEYWORD_WEIGHT / (60 + i + 1)
    const existing = scores.get(key)
    if (existing) {
      existing.score += rrf
    } else {
      scores.set(key, {
        result: {
          point_id: '',
          score: r.rank,
          payload: {
            user_id: '',
            document_id: r.document_id,
            filename: r.filename,
            chunk_index: r.chunk_index,
            chunk_text: r.chunk_text,
            classroom_id: undefined,
            product: 'classroom',
          },
        },
        score: rrf,
      })
    }
  })

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ result, score }) => ({ ...result, score }))
}

export async function hybridSearchClassroom(
  supabase: SupabaseClient,
  classroomId: string,
  query: string,
  vector: number[],
  topK: number,
  options: { serviceRole?: boolean } = {}
): Promise<SearchResult[]> {
  const candidateCount = Number(process.env.RERANK_CANDIDATES ?? 20)

  const [vectorResults, keywordResults] = await Promise.all([
    searchClassroomChunks(classroomId, vector, candidateCount),
    keywordSearchClassroom(
      supabase,
      classroomId,
      query,
      candidateCount,
      options.serviceRole
    ),
  ])

  logger.info('Classroom hybrid search', {
    classroomId,
    vectorHits: vectorResults.length,
    keywordHits: keywordResults.length,
  })

  return fuseResults(vectorResults, keywordResults, topK)
}

async function keywordSearchClassroom(
  supabase: SupabaseClient,
  classroomId: string,
  query: string,
  limit: number,
  serviceRole = false
) {
  if (!query.trim()) return []

  const rpcName = serviceRole
    ? 'search_classroom_document_chunks_internal'
    : 'search_classroom_document_chunks'

  const { data, error } = await supabase.rpc(rpcName, {
    p_classroom_id: classroomId,
    p_query: query,
    p_limit: limit,
  })

  if (error) {
    logger.error('Classroom keyword search failed', { err: error, classroomId })
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
