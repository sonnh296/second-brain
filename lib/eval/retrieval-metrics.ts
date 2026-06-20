export interface EvalCase {
  question: string
  /** Match if retrieved chunk filename contains any of these (case-insensitive) */
  expected_filenames?: string[]
  /** Match if chunk text contains any term (case-insensitive) */
  expected_terms?: string[]
}

export interface EvalDataset {
  k?: number
  cases: EvalCase[]
}

export interface RetrievedChunkRef {
  filename: string
  chunk_text: string
  chunk_index: number
  document_id: string
  score: number
}

export interface CaseMetrics {
  question: string
  hit_at_k: boolean
  precision_at_k: number
  reciprocal_rank: number
  top_filenames: string[]
}

export interface EvalSummary {
  k: number
  case_count: number
  hit_at_k: number
  mean_precision_at_k: number
  mrr: number
  cases: CaseMetrics[]
}

function normalizeText(value: string): string {
  return value.toLowerCase()
}

export function isRelevantChunk(
  chunk: RetrievedChunkRef,
  evalCase: EvalCase
): boolean {
  const filename = normalizeText(chunk.filename)
  const text = normalizeText(chunk.chunk_text)

  if (evalCase.expected_filenames?.length) {
    const filenameMatch = evalCase.expected_filenames.some((name) =>
      filename.includes(normalizeText(name))
    )
    if (filenameMatch) return true
  }

  if (evalCase.expected_terms?.length) {
    return evalCase.expected_terms.some((term) => text.includes(normalizeText(term)))
  }

  return false
}

export function scoreCase(
  evalCase: EvalCase,
  retrieved: RetrievedChunkRef[],
  k: number
): CaseMetrics {
  const topK = retrieved.slice(0, k)
  const relevances = topK.map((chunk) => isRelevantChunk(chunk, evalCase))
  const firstRelevantRank = relevances.findIndex(Boolean)

  const relevantCount = relevances.filter(Boolean).length

  return {
    question: evalCase.question,
    hit_at_k: firstRelevantRank >= 0,
    precision_at_k: relevantCount / k,
    reciprocal_rank: firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0,
    top_filenames: topK.map((c) => c.filename),
  }
}

export function summarizeEval(
  cases: EvalCase[],
  results: RetrievedChunkRef[][],
  k: number
): EvalSummary {
  const caseMetrics = cases.map((evalCase, i) =>
    scoreCase(evalCase, results[i] ?? [], k)
  )

  const count = caseMetrics.length || 1

  return {
    k,
    case_count: cases.length,
    hit_at_k: caseMetrics.filter((c) => c.hit_at_k).length / count,
    mean_precision_at_k:
      caseMetrics.reduce((sum, c) => sum + c.precision_at_k, 0) / count,
    mrr: caseMetrics.reduce((sum, c) => sum + c.reciprocal_rank, 0) / count,
    cases: caseMetrics,
  }
}
