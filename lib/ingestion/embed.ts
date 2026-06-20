import OpenAI from 'openai'

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

/**
 * Embed an array of text strings in batches.
 * Returns an array of float vectors, same order as input.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI()
  const vectors: number[][] = []

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
  }

  return vectors
}

export async function embedSingle(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text])
  return vector
}
