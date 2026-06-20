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
  query: string
): Promise<SourceChunk[]> {
  if (!isDocumentInventoryQuery(query)) return []

  const keywords = extractSearchKeywords(query)

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, filename, description, file_type, chunk_count')
    .eq('user_id', userId)
    .eq('status', 'done')
    .order('created_at', { ascending: false })

  if (error || !docs?.length) return []

  const matched = (docs as DocumentRow[]).filter((d) => documentMatchesKeywords(d, keywords))
  if (matched.length === 0) return []

  return matched.map((d) => ({
    filename: d.filename,
    chunk_index: 0,
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
  userId: string
): Promise<SourceChunk[]> {
  const { data: docs } = await supabase
    .from('documents')
    .select('filename, file_type, chunk_count')
    .eq('user_id', userId)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(30)

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
