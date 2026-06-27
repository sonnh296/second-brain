import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tag } from './types'

type TagRow = { tags: Tag | Tag[] | null }

export function flattenDocumentTags(rows: TagRow[] | null | undefined): Tag[] {
  if (!rows?.length) return []
  return rows
    .map((row) => (Array.isArray(row.tags) ? row.tags[0] : row.tags))
    .filter((tag): tag is Tag => Boolean(tag))
}

export async function syncDocumentTags(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  tagIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uniqueIds = [...new Set(tagIds)]

  if (uniqueIds.length > 0) {
    const { data: ownedTags, error: tagErr } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .in('id', uniqueIds)

    if (tagErr) {
      return { ok: false, error: 'Failed to verify tags' }
    }
    if ((ownedTags ?? []).length !== uniqueIds.length) {
      return { ok: false, error: 'Một hoặc nhiều tag không hợp lệ' }
    }
  }

  const { error: deleteErr } = await supabase
    .from('document_tags')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)

  if (deleteErr) {
    return { ok: false, error: 'Failed to update tags' }
  }

  if (uniqueIds.length === 0) {
    return { ok: true }
  }

  const { error: insertErr } = await supabase.from('document_tags').insert(
    uniqueIds.map((tagId) => ({
      document_id: documentId,
      tag_id: tagId,
      user_id: userId,
    }))
  )

  if (insertErr) {
    return { ok: false, error: 'Failed to update tags' }
  }

  return { ok: true }
}

export async function fetchTagsForDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<Tag[]> {
  const { data } = await supabase
    .from('document_tags')
    .select('tags (id, name, color)')
    .eq('document_id', documentId)

  return flattenDocumentTags(data as TagRow[] | null)
}
