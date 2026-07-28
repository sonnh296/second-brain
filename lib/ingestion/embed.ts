import OpenAI from 'openai'
import { logUsage, type UsagePurpose } from '@/lib/usage/log'

let _openai: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  return _openai
}

const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
const BATCH_SIZE = 2048

export type EmbedOptions = {
  userId?: string
  purpose?: Extract<UsagePurpose, 'embedding_query' | 'embedding_ingest'>
  documentId?: string
}

/**
 * Embed an array of text strings in batches.
 * Returns an array of float vectors, same order as input.
 */
export async function embedBatch(
  texts: string[],
  opts?: EmbedOptions
): Promise<number[][]> {
  const openai = getOpenAI()
  const vectors: number[][] = []
  let promptTokens = 0
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    })
    const sorted = [...response.data].sort((a, b) => a.index - b.index)
    for (const item of sorted) {
      vectors.push(item.embedding)
    }
    promptTokens += response.usage?.prompt_tokens ?? 0
    totalTokens += response.usage?.total_tokens ?? response.usage?.prompt_tokens ?? 0
  }

  if (opts?.userId && (promptTokens > 0 || totalTokens > 0)) {
    await logUsage({
      userId: opts.userId,
      purpose: opts.purpose ?? 'embedding_query',
      model: EMBEDDING_MODEL,
      inputTokens: promptTokens,
      outputTokens: 0,
      totalTokens: totalTokens || promptTokens,
      metadata: opts.documentId ? { document_id: opts.documentId } : {},
    })
  }

  return vectors
}

export async function embedSingle(
  text: string,
  opts?: EmbedOptions
): Promise<number[]> {
  const [vector] = await embedBatch([text], opts)
  return vector
}
