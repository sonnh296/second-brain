import type { CitedSource } from '@/lib/db/types'

export type HistoryTurn = {
  role: string
  content: string
  cited_sources?: CitedSource[] | null
}

export type FollowUpRetrieval = {
  /** True when this turn should reuse prior RAG context. */
  isFollowUp: boolean
  /** Query string used for embed + hybrid search. */
  searchQuery: string
  /** Prior document ids to pin/search within (empty = full corpus). */
  stickyDocumentIds: string[]
  /** Filenames from last assistant citations (for logging / rewrite). */
  priorFilenames: string[]
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Short / anaphoric asks that usually refer to the previous turn. */
const FOLLOW_UP_RE =
  /\b(nua|do|nay|kia|tiep|them|chi tiet|cu the|ro hon|xem lai|mo lai|mo file|file do|file nay|tai lieu do|tai lieu nay|nguon|link|url|duong dan|cho toi|gui toi|gui link|cho link|xem file|mo no|cai do|cai nay|same|that|this|more|again|detail|details|link)\b/i

const STOP_FOR_TOPIC = new Set([
  'toi',
  'minh',
  'ban',
  'cho',
  've',
  'cua',
  'va',
  'thi',
  'la',
  'co',
  'khong',
  'gi',
  'nao',
  'hay',
  'hoac',
  'voi',
  'trong',
  'mot',
  'cac',
  'nhung',
  'duoc',
  'please',
  'the',
  'a',
  'an',
  'to',
  'of',
  'for',
  'me',
  'my',
  'you',
])

function extractTopicTokens(text: string): string[] {
  const normalized = normalize(text).replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  return [
    ...new Set(
      normalized
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && !STOP_FOR_TOPIC.has(t) && !FOLLOW_UP_RE.test(t))
    ),
  ].slice(0, 8)
}

export function isFollowUpMessage(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  const n = normalize(trimmed)
  const words = n.split(/\s+/).filter(Boolean)
  if (words.length <= 8 && FOLLOW_UP_RE.test(n)) return true
  // Very short continuation without a clear new topic
  if (words.length <= 4 && trimmed.length <= 40) return true
  return false
}

/**
 * Looks like a new topical question (should not sticky-pin old docs).
 * e.g. "modbus tcp là gì" after talking about schedule.
 */
export function looksLikeNewTopic(message: string, priorUserContent: string): boolean {
  const msgTokens = extractTopicTokens(message)
  if (msgTokens.length === 0) return false
  if (isFollowUpMessage(message) && msgTokens.length <= 1) return false

  const priorTokens = new Set(extractTopicTokens(priorUserContent))
  const novel = msgTokens.filter((t) => !priorTokens.has(t))
  // Enough novel distinctive tokens → treat as topic switch
  return novel.length >= 2 && message.trim().length >= 24
}

function lastUserAndAssistant(history: HistoryTurn[]): {
  priorUser: HistoryTurn | null
  priorAssistant: HistoryTurn | null
} {
  let priorAssistant: HistoryTurn | null = null
  let priorUser: HistoryTurn | null = null
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]
    if (!priorAssistant && m.role === 'assistant') priorAssistant = m
    if (!priorUser && m.role === 'user') {
      priorUser = m
      break
    }
    if (priorAssistant && m.role === 'user') {
      priorUser = m
      break
    }
  }
  return { priorUser, priorAssistant }
}

function citationsFromAssistant(msg: HistoryTurn | null): CitedSource[] {
  if (!msg?.cited_sources || !Array.isArray(msg.cited_sources)) return []
  return msg.cited_sources.filter((c) => c && (c.document_id || c.filename))
}

/**
 * Resolve how to retrieve for this turn given recent session history (oldest → newest).
 */
export function resolveFollowUpRetrieval(
  message: string,
  history: HistoryTurn[]
): FollowUpRetrieval {
  const base: FollowUpRetrieval = {
    isFollowUp: false,
    searchQuery: message,
    stickyDocumentIds: [],
    priorFilenames: [],
  }

  if (!message.trim() || history.length === 0) return base

  const { priorUser, priorAssistant } = lastUserAndAssistant(history)
  const cites = citationsFromAssistant(priorAssistant)
  const priorFilenames = [...new Set(cites.map((c) => c.filename).filter(Boolean))]
  const stickyDocumentIds = [
    ...new Set(
      cites
        .map((c) => c.document_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]

  if (stickyDocumentIds.length === 0 && priorFilenames.length === 0) {
    // Still expand short follow-ups with prior user question for better embedding/FTS
    if (isFollowUpMessage(message) && priorUser?.content?.trim()) {
      return {
        isFollowUp: true,
        searchQuery: `${message}\n${priorUser.content.trim()}`.slice(0, 500),
        stickyDocumentIds: [],
        priorFilenames: [],
      }
    }
    return base
  }

  if (looksLikeNewTopic(message, priorUser?.content ?? '')) {
    return base
  }

  if (!isFollowUpMessage(message) && !looksLikeWeakStandalone(message)) {
    return base
  }

  const nameHint = priorFilenames.join(' ')
  const priorQ = priorUser?.content?.trim() ?? ''
  const searchQuery = [message.trim(), priorQ, nameHint].filter(Boolean).join('\n').slice(0, 600)

  return {
    isFollowUp: true,
    searchQuery,
    stickyDocumentIds,
    priorFilenames,
  }
}

/** Short vague ask without follow-up markers — still benefit from sticky if cites exist. */
function looksLikeWeakStandalone(message: string): boolean {
  const words = normalize(message)
    .split(/\s+/)
    .filter(Boolean)
  return words.length <= 6 && message.trim().length <= 50
}

/**
 * Soft citation fallback when the model used retrieved sources but omitted CITATIONS.
 * Prefer sources whose filename appears in the answer; else top-scoring unique files.
 */
export function fallbackCitationsFromSources(
  answerContent: string,
  availableSources: {
    filename: string
    chunk_index: number
    score?: number
    document_id?: string
    file_type?: string
    page?: number
  }[],
  options: { maxFiles?: number } = {}
): CitedSource[] {
  const maxFiles = options.maxFiles ?? 3
  if (availableSources.length === 0) return []

  const lower = answerContent.toLowerCase()
  const mentioned = availableSources.filter((s) =>
    lower.includes(s.filename.toLowerCase())
  )

  const pool = mentioned.length > 0 ? mentioned : [...availableSources].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  )

  const seen = new Set<string>()
  const out: CitedSource[] = []
  for (const s of pool) {
    const key = s.document_id || s.filename
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      filename: s.filename,
      chunk_index: s.chunk_index,
      document_id: s.document_id,
      file_type: s.file_type,
      page: s.page,
    })
    if (out.length >= maxFiles) break
  }
  return out
}
