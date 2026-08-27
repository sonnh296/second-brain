import { QdrantClient } from '@qdrant/js-client-rest'
import { getCollectionName } from './collection'

const VECTOR_SIZE = 1536 // text-embedding-3-small dimension

let _client: QdrantClient | null = null

export function getQdrantClient(): QdrantClient {
  if (!_client) {
    _client = new QdrantClient({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY,
    })
  }
  return _client
}

export interface ChunkPayload {
  user_id: string
  document_id: string
  filename: string
  chunk_index: number
  chunk_text: string
  /** PDF page number the chunk starts on (page-accurate citations). */
  page?: number
  /** Classroom product isolation — required for class RAG filters. */
  classroom_id?: string
  product?: 'personal' | 'classroom'
  [key: string]: unknown
}

export interface SearchResult {
  point_id: string
  score: number
  payload: ChunkPayload
}

/** Idempotent — safe to call on every app start */
export async function ensureCollection(): Promise<void> {
  const client = getQdrantClient()
  const collections = await client.getCollections()
  const exists = collections.collections.some((c) => c.name === getCollectionName())

  if (!exists) {
    await client.createCollection(getCollectionName(), {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
      on_disk_payload: true,
    })
  }

  // Payload indexes — idempotent (Qdrant ignores if already exists)
  for (const field of ['user_id', 'document_id', 'classroom_id', 'product'] as const) {
    try {
      await client.createPayloadIndex(getCollectionName(), {
        field_name: field,
        field_schema: 'keyword',
      })
    } catch {
      // Index already exists — safe to ignore
    }
  }
}

export interface UpsertChunk {
  pointId: string
  vector: number[]
  payload: ChunkPayload
}

export async function upsertChunks(chunks: UpsertChunk[]): Promise<void> {
  const client = getQdrantClient()
  await client.upsert(getCollectionName(), {
    wait: true,
    points: chunks.map((c) => ({
      id: c.pointId,
      vector: c.vector,
      payload: c.payload,
    })),
  })
}

export async function updateDocumentFilename(
  userId: string,
  documentId: string,
  filename: string
): Promise<void> {
  const client = getQdrantClient()
  await client.setPayload(getCollectionName(), {
    payload: { filename },
    filter: {
      must: [
        { key: 'user_id', match: { value: userId } },
        { key: 'document_id', match: { value: documentId } },
      ],
    },
  })
}

export async function searchChunks(
  userId: string,
  vector: number[],
  topK: number,
  options: { documentIds?: string[] } = {}
): Promise<SearchResult[]> {
  const documentIds = options.documentIds
  if (documentIds && documentIds.length === 0) return []

  const must: { key: string; match: { value: string } | { any: string[] } }[] = [
    { key: 'user_id', match: { value: userId } },
  ]
  if (documentIds && documentIds.length > 0) {
    must.push({ key: 'document_id', match: { any: documentIds } })
  }

  const client = getQdrantClient()
  const results = await client.search(getCollectionName(), {
    vector,
    limit: topK,
    filter: { must },
    with_payload: true,
  })

  return results.map((r) => ({
    point_id: String(r.id),
    score: r.score,
    payload: r.payload as unknown as ChunkPayload,
  }))
}

/** Classroom RAG — filter by classroom_id only (shared corpus for all members). */
export async function searchClassroomChunks(
  classroomId: string,
  vector: number[],
  topK: number,
  options: { documentIds?: string[] } = {}
): Promise<SearchResult[]> {
  const documentIds = options.documentIds
  if (documentIds && documentIds.length === 0) return []

  const must: { key: string; match: { value: string } | { any: string[] } }[] = [
    { key: 'classroom_id', match: { value: classroomId } },
    { key: 'product', match: { value: 'classroom' } },
  ]
  if (documentIds && documentIds.length > 0) {
    must.push({ key: 'document_id', match: { any: documentIds } })
  }

  const client = getQdrantClient()
  const results = await client.search(getCollectionName(), {
    vector,
    limit: topK,
    filter: { must },
    with_payload: true,
  })

  return results.map((r) => ({
    point_id: String(r.id),
    score: r.score,
    payload: r.payload as unknown as ChunkPayload,
  }))
}

export async function deleteByClassroomDocument(
  classroomId: string,
  documentId: string
): Promise<void> {
  const client = getQdrantClient()
  await client.delete(getCollectionName(), {
    wait: true,
    filter: {
      must: [
        { key: 'classroom_id', match: { value: classroomId } },
        { key: 'document_id', match: { value: documentId } },
      ],
    },
  })
}

export async function deleteByDocument(
  userId: string,
  documentId: string
): Promise<void> {
  const client = getQdrantClient()
  await client.delete(getCollectionName(), {
    wait: true,
    filter: {
      must: [
        { key: 'user_id', match: { value: userId } },
        { key: 'document_id', match: { value: documentId } },
      ],
    },
  })
}

export interface StoredChunk {
  vector: number[]
  payload: ChunkPayload
}

/** Scroll all vector points for a document (used when copying duplicate content). */
export async function listChunksByDocument(
  userId: string,
  documentId: string
): Promise<StoredChunk[]> {
  const client = getQdrantClient()
  const chunks: StoredChunk[] = []
  let offset: string | number | Record<string, unknown> | undefined

  while (true) {
    const result = await client.scroll(getCollectionName(), {
      filter: {
        must: [
          { key: 'user_id', match: { value: userId } },
          { key: 'document_id', match: { value: documentId } },
        ],
      },
      limit: 100,
      offset,
      with_vector: true,
      with_payload: true,
    })

    for (const point of result.points) {
      if (!point.vector || !point.payload) continue
      chunks.push({
        vector: point.vector as number[],
        payload: point.payload as unknown as ChunkPayload,
      })
    }

    if (result.next_page_offset == null) break
    offset = result.next_page_offset
  }

  return chunks.sort((a, b) => a.payload.chunk_index - b.payload.chunk_index)
}

export interface QdrantDocumentRef {
  user_id: string
  document_id: string
  point_count: number
}

/** Scan collection and aggregate point counts per document. */
export async function scrollDocumentReferences(): Promise<QdrantDocumentRef[]> {
  const client = getQdrantClient()
  const counts = new Map<string, QdrantDocumentRef>()
  let offset: string | number | Record<string, unknown> | undefined

  while (true) {
    const result = await client.scroll(getCollectionName(), {
      limit: 200,
      offset,
      with_payload: true,
      with_vector: false,
    })

    for (const point of result.points) {
      const payload = point.payload as unknown as Partial<ChunkPayload> | undefined
      const userId = payload?.user_id
      const documentId = payload?.document_id
      if (!userId || !documentId) continue

      const key = `${userId}:${documentId}`
      const existing = counts.get(key)
      if (existing) {
        existing.point_count += 1
      } else {
        counts.set(key, {
          user_id: userId,
          document_id: documentId,
          point_count: 1,
        })
      }
    }

    if (result.next_page_offset == null) break
    offset = result.next_page_offset
  }

  return [...counts.values()]
}
