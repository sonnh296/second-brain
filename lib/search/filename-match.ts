import type { SupabaseClient } from '@supabase/supabase-js'
import { STOP_WORDS } from '../ai/query-intent'
import { logger } from '../logger'
import type { SearchResult } from '../vector'

const MAX_MATCHED_DOCS = 3
const MAX_FILENAME_CHUNKS = 4
const DEFAULT_MIN_CHUNKS = 3
const DEFAULT_CHUNKS = 5
const DEFAULT_MAX_CHUNKS = 8
const DEFAULT_TOKEN_BUDGET = 8000
const DEFAULT_SCORE_KEEP_RATIO = 0.8

/** Extra function words — too common to pin a document by filename. */
const FILENAME_STOP = new Set([
  'so',
  'sanh',
  'thiet',
  'bi',
  'giua',
  'voi',
  'ca',
  'cac',
  'muc',
  'nay',
  'kia',
  'nhu',
  'nhung',
  'chinh',
  'lien',
  'quan',
  'tom',
  'tat',
  'noi',
  'dung',
  'xem',
  'lai',
  'tim',
  'giup',
  'vao',
  'ra',
  'mot',
  'hai',
  'va',
  'hoac',
  'thi',
  'la',
  'duoc',
  'bang',
  'den',
  'tu',
  'cung',
  'di',
  'cai',
  'gach',
  'dau',
  'dong',
  'hang',
  'y',
  'word',
  'docx',
  'pdf',
  'txt',
  'mp4',
  'png',
  'jpg',
  'jpeg',
  'related',
  'about',
  'what',
  'which',
  'with',
  'from',
  'this',
  'that',
  'does',
  'find',
  'search',
  'list',
  'show',
  'give',
  'please',
  'help',
  'between',
  'compare',
])

export type ContextChunk = {
  document_id: string
  chunk_index: number
  chunk_text: string
  score: number
  matched_by_filename?: boolean
  filename_match_strong?: boolean
}

export type SelectContextOptions = {
  minChunks?: number
  defaultChunks?: number
  maxChunks?: number
  tokenBudget?: number
  scoreKeepRatio?: number
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('đ', 'd')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

function sanitizeIlike(term: string): string {
  return term.replaceAll(/[%_,()]/g, ' ').trim()
}

function stripEdgeHyphens(token: string): string {
  let start = 0
  let end = token.length
  while (start < end && token[start] === '-') start++
  while (end > start && token[end - 1] === '-') end--
  return token.slice(start, end)
}

function chunkKey(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`
}

function diversifyByDocument<T extends ContextChunk>(chunks: T[], maxPerDoc: number): T[] {
  const picked: T[] = []
  const perDoc = new Map<string, number>()
  for (const c of chunks) {
    const n = perDoc.get(c.document_id) ?? 0
    if (n >= maxPerDoc) continue
    perDoc.set(c.document_id, n + 1)
    picked.push(c)
  }
  return picked
}

function resolveSelectLimits(options: SelectContextOptions) {
  const minChunks = options.minChunks ?? envNumber('RAG_MIN_CHUNKS', DEFAULT_MIN_CHUNKS)
  const maxChunks = Math.max(
    minChunks,
    options.maxChunks ?? envNumber('RAG_MAX_CHUNKS', DEFAULT_MAX_CHUNKS)
  )
  const defaultChunks = Math.min(
    maxChunks,
    Math.max(minChunks, options.defaultChunks ?? envNumber('RERANK_TOP_N', DEFAULT_CHUNKS))
  )
  return {
    minChunks,
    maxChunks,
    defaultChunks,
    tokenBudget: options.tokenBudget ?? envNumber('RAG_CONTEXT_TOKEN_BUDGET', DEFAULT_TOKEN_BUDGET),
    scoreKeepRatio:
      options.scoreKeepRatio ?? envNumber('RAG_SCORE_KEEP_RATIO', DEFAULT_SCORE_KEEP_RATIO),
  }
}

/** Distinctive tokens from a chat query used to match document filenames. */
export function extractFilenameKeywords(query: string): string[] {
  const normalized = normalize(query).replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  const tokens = normalized
    .split(/\s+/)
    .map(stripEdgeHyphens)
    .filter((k) => k.length >= 3 && !STOP_WORDS.has(k) && !FILENAME_STOP.has(k))
  const unique = [...new Set(tokens)]
  unique.sort((a, b) => b.length - a.length || a.localeCompare(b))
  return unique.slice(0, 8)
}

export function scoreFilenameHaystack(
  filename: string,
  description: string | null,
  keywords: string[]
): { score: number; hits: number; strong: boolean } {
  const name = normalize(filename)
  const desc = normalize(description ?? '')
  let score = 0
  let hits = 0
  let longHit = false

  for (const k of keywords) {
    const nk = normalize(k)
    if (!nk) continue
    const inName = name.includes(nk)
    const inDesc = desc.includes(nk)
    if (!inName && !inDesc) continue
    hits++
    score += inName ? nk.length * 2 : nk.length
    if (nk.length >= 5 && inName) longHit = true
  }

  return { score, hits, strong: hits >= 2 || longHit }
}

/** Rough token estimate — CJK is denser than Latin. */
export function estimateTokens(text: string): number {
  let cjk = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x4e00 && code <= 0x9fff) cjk++
  }
  return Math.max(1, Math.ceil(cjk / 1.5 + (text.length - cjk) / 4))
}

/**
 * Load early chunks from documents whose filename/description matches the query.
 * Works without re-embedding — covers existing files like "leishine" vs Chinese body text.
 */
export async function loadFilenameMatchedChunks(
  supabase: SupabaseClient,
  userId: string,
  query: string
): Promise<SearchResult[]> {
  const keywords = extractFilenameKeywords(query)
  if (keywords.length === 0) return []

  const orFilter = keywords
    .slice(0, 6)
    .flatMap((k) => {
      const t = sanitizeIlike(k)
      if (t.length < 3) return []
      return [`filename.ilike.%${t}%`, `description.ilike.%${t}%`]
    })
    .join(',')

  if (!orFilter) return []

  let { data: docs, error } = await supabase
    .from('documents')
    .select('id, filename, description')
    .eq('user_id', userId)
    .eq('status', 'done')
    .is('deleted_at', null)
    .or(orFilter)
    .limit(40)

  if (error && (error.code === '42703' || error.message?.includes('deleted_at'))) {
    ;({ data: docs, error } = await supabase
      .from('documents')
      .select('id, filename, description')
      .eq('user_id', userId)
      .eq('status', 'done')
      .or(orFilter)
      .limit(40))
  }

  if (error) {
    logger.warn('Filename document search failed', { err: error.message, userId })
    return []
  }

  const ranked = (docs ?? [])
    .map((d) => {
      const s = scoreFilenameHaystack(d.filename as string, d.description as string | null, keywords)
      return {
        id: d.id as string,
        filename: d.filename as string,
        ...s,
      }
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)

  if (ranked.length === 0) return []

  const best = ranked[0].score
  const chosen = ranked.filter((d) => d.score >= best * 0.5).slice(0, MAX_MATCHED_DOCS)

  const { data: chunkRows, error: chunkError } = await supabase
    .from('document_chunks')
    .select('document_id, chunk_index, chunk_text, page')
    .in(
      'document_id',
      chosen.map((d) => d.id)
    )
    .order('chunk_index', { ascending: true })

  if (chunkError) {
    logger.warn('Filename chunk load failed', { err: chunkError.message, userId })
    return []
  }

  const byDoc = new Map<string, typeof chunkRows>()
  for (const row of chunkRows ?? []) {
    const id = row.document_id as string
    const list = byDoc.get(id) ?? []
    list.push(row)
    byDoc.set(id, list)
  }

  const results: SearchResult[] = []
  for (const doc of chosen) {
    const remaining = MAX_FILENAME_CHUNKS - results.length
    if (remaining <= 0) break
    const want = Math.min(doc.strong ? 3 : 2, remaining)
    const rows = (byDoc.get(doc.id) ?? []).slice(0, want)
    for (const row of rows) {
      results.push({
        point_id: `filename:${doc.id}:${row.chunk_index}`,
        score: 1,
        payload: {
          user_id: userId,
          document_id: doc.id,
          filename: doc.filename,
          chunk_index: row.chunk_index as number,
          chunk_text: (row.chunk_text as string) ?? '',
          ...(typeof row.page === 'number' ? { page: row.page } : {}),
          matched_by_filename: true,
          filename_match_strong: doc.strong,
        },
      })
    }
  }

  if (results.length > 0) {
    logger.info('RAG filename match', {
      userId,
      keywords,
      files: chosen.map((d) => d.filename),
      chunkCount: results.length,
    })
  }

  return results
}

/** Prepend filename hits so later top-N cutoff cannot drop them. */
export function mergeFilenameMatches(
  fused: SearchResult[],
  filenameResults: SearchResult[],
  topK: number
): SearchResult[] {
  if (filenameResults.length === 0) return fused.slice(0, topK)

  const seen = new Set<string>()
  const out: SearchResult[] = []

  for (const r of [...filenameResults, ...fused]) {
    const key = chunkKey(r.payload.document_id, r.payload.chunk_index)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }

  return out.slice(0, Math.max(topK, filenameResults.length))
}

/**
 * Final context window: pin filename matches, diversify other files,
 * then expand 5→8 when extra chunks still look relevant.
 */
export function selectContextChunks<T extends ContextChunk>(
  chunks: T[],
  options: SelectContextOptions = {}
): T[] {
  if (chunks.length === 0) return []

  const { minChunks, maxChunks, defaultChunks, tokenBudget, scoreKeepRatio } =
    resolveSelectLimits(options)

  const pinned = chunks.filter((c) => c.matched_by_filename)
  const rest = chunks.filter((c) => !c.matched_by_filename)
  const pinnedDocIds = new Set(pinned.map((c) => c.document_id))
  const strongPin = pinned.some((c) => c.filename_match_strong)

  const fromPinnedDocs = rest
    .filter((c) => pinnedDocIds.has(c.document_id))
    .sort((a, b) => a.chunk_index - b.chunk_index || b.score - a.score)

  const others = rest
    .filter((c) => !pinnedDocIds.has(c.document_id))
    .sort((a, b) => b.score - a.score)

  const diversified = diversifyByDocument(others, strongPin ? 1 : 2)

  const picked: T[] = []
  const pickedKeys = new Set<string>()
  let tokens = 0

  const tryAdd = (c: T, force: boolean): boolean => {
    const key = chunkKey(c.document_id, c.chunk_index)
    if (pickedKeys.has(key)) return false
    if (picked.length >= maxChunks) return false
    const t = estimateTokens(c.chunk_text)
    if (!force && tokens + t > tokenBudget) return false
    picked.push(c)
    pickedKeys.add(key)
    tokens += t
    return true
  }

  for (const c of pinned) {
    tryAdd(c, picked.length < minChunks)
  }

  for (const c of fromPinnedDocs) {
    if (picked.length >= (strongPin ? defaultChunks : minChunks)) break
    tryAdd(c, picked.length < minChunks)
  }

  for (const c of diversified) {
    if (picked.length >= defaultChunks) break
    tryAdd(c, picked.length < minChunks)
  }

  const peak = diversified[0]?.score ?? fromPinnedDocs[0]?.score ?? 0
  const expandPool = [...fromPinnedDocs, ...diversified]
  for (const c of expandPool) {
    if (picked.length >= maxChunks) break
    const samePinnedDoc = pinnedDocIds.has(c.document_id)
    const closeScore = peak > 0 && c.score >= peak * scoreKeepRatio
    if (samePinnedDoc || closeScore) {
      tryAdd(c, false)
    }
  }

  return picked
}

/** @deprecated Use selectContextChunks — kept as a named alias for rerank. */
export function pinFilenameMatches<T extends ContextChunk>(
  chunks: T[],
  _topN?: number
): T[] {
  return selectContextChunks(chunks, _topN != null ? { defaultChunks: _topN } : {})
}
