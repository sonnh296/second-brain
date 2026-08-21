import type { SupabaseClient } from '@supabase/supabase-js'
import type { SourceChunk } from '../ai/prompt'
import { extractSearchKeywords, isDocumentInventoryQuery } from '../ai/query-intent'

interface DocumentRow {
  id: string
  filename: string
  description: string | null
  file_type: string
  chunk_count: number | null
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function documentMatchesKeywords(doc: DocumentRow, keywords: string[]): boolean {
  if (keywords.length === 0) return true
  const haystack = normalize(`${doc.filename} ${doc.description ?? ''} ${doc.file_type}`)
  return keywords.some((k) => haystack.includes(normalize(k)))
}

/** Answer "do I have X documents?" by searching filenames in Postgres. */
export async function searchDocumentInventory(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  options: { documentIds?: string[] } = {}
): Promise<SourceChunk[]> {
  if (!isDocumentInventoryQuery(query)) return []
  if (options.documentIds && options.documentIds.length === 0) return []

  const keywords = extractSearchKeywords(query)

  let queryBuilder = supabase
    .from('documents')
    .select('id, filename, description, file_type, chunk_count')
    .eq('user_id', userId)
    .eq('status', 'done')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (options.documentIds && options.documentIds.length > 0) {
    queryBuilder = queryBuilder.in('id', options.documentIds)
  }

  let { data: docs, error } = await queryBuilder

  // Migration 015 chưa chạy → bỏ filter deleted_at
  if (error && (error.code === '42703' || error.message?.includes('deleted_at'))) {
    let fallback = supabase
      .from('documents')
      .select('id, filename, description, file_type, chunk_count')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
    if (options.documentIds && options.documentIds.length > 0) {
      fallback = fallback.in('id', options.documentIds)
    }
    ;({ data: docs, error } = await fallback)
  }

  if (error || !docs?.length) return []

  const matched = (docs as DocumentRow[]).filter((d) => documentMatchesKeywords(d, keywords))
  if (matched.length === 0) return []

  return matched.map((d) => ({
    filename: d.filename,
    chunk_index: 0,
    document_id: d.id,
    file_type: d.file_type,
    chunk_text: [
      `Tên file: ${d.filename}`,
      `Loại: ${d.file_type}`,
      `Số đoạn đã index: ${d.chunk_count ?? 0}`,
      d.description ? `Mô tả: ${d.description}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  }))
}

/** Short catalog injected when inventory query finds nothing by keyword. */
export async function listUserDocumentCatalog(
  supabase: SupabaseClient,
  userId: string,
  options: { documentIds?: string[] } = {}
): Promise<SourceChunk[]> {
  if (options.documentIds && options.documentIds.length === 0) return []

  let queryBuilder = supabase
    .from('documents')
    .select('filename, file_type, chunk_count')
    .eq('user_id', userId)
    .eq('status', 'done')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(30)

  if (options.documentIds && options.documentIds.length > 0) {
    queryBuilder = queryBuilder.in('id', options.documentIds)
  }

  let { data: docs, error } = await queryBuilder

  if (error && (error.code === '42703' || error.message?.includes('deleted_at'))) {
    let fallback = supabase
      .from('documents')
      .select('filename, file_type, chunk_count')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(30)
    if (options.documentIds && options.documentIds.length > 0) {
      fallback = fallback.in('id', options.documentIds)
    }
    ;({ data: docs } = await fallback)
  }

  if (!docs?.length) return []

  return [
    {
      filename: 'danh-sach-tai-lieu.txt',
      chunk_index: 0,
      chunk_text: docs
        .map(
          (d, i) =>
            `${i + 1}. ${d.filename} (${d.file_type}, ${d.chunk_count ?? 0} đoạn)`
        )
        .join('\n'),
    },
  ]
}
