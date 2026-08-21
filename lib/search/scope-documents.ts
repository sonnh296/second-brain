import type { SupabaseClient } from '@supabase/supabase-js'

export type ChatDocumentScope = {
  /** Match documents that have any of these tags (OR). Empty / omitted = no tag filter. */
  tagIds?: string[]
  /** Exact folder only (not nested). Null/undefined = no folder filter. */
  folderId?: string | null
}

export type ResolvedDocumentScope =
  | { active: false }
  | { active: true; documentIds: string[] }

/**
 * Resolve chat scope filters to a set of ready document IDs.
 * When no filters are set, returns `{ active: false }` (search whole library).
 * When filters are set but nothing matches, returns `{ active: true, documentIds: [] }`.
 */
export async function resolveDocumentScope(
  supabase: SupabaseClient,
  userId: string,
  scope: ChatDocumentScope = {}
): Promise<ResolvedDocumentScope> {
  const tagIds = [...new Set((scope.tagIds ?? []).filter(Boolean))]
  const folderId = scope.folderId ?? undefined
  const hasTagFilter = tagIds.length > 0
  const hasFolderFilter = folderId !== undefined && folderId !== null

  if (!hasTagFilter && !hasFolderFilter) {
    return { active: false }
  }

  let allowedIds: Set<string> | null = null

  if (hasTagFilter) {
    const { data: rows, error } = await supabase
      .from('document_tags')
      .select('document_id')
      .eq('user_id', userId)
      .in('tag_id', tagIds)

    if (error) {
      throw new Error(`Failed to resolve tag scope: ${error.message}`)
    }

    allowedIds = new Set((rows ?? []).map((r) => r.document_id as string))
    if (allowedIds.size === 0) {
      return { active: true, documentIds: [] }
    }
  }

  let query = supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'done')
    .is('deleted_at', null)

  if (allowedIds) {
    query = query.in('id', [...allowedIds])
  }
  if (hasFolderFilter) {
    query = query.eq('folder_id', folderId)
  }

  let { data: docs, error: docError } = await query

  if (docError && (docError.code === '42703' || docError.message?.includes('deleted_at'))) {
    let fallback = supabase
      .from('documents')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'done')

    if (allowedIds) {
      fallback = fallback.in('id', [...allowedIds])
    }
    if (hasFolderFilter) {
      fallback = fallback.eq('folder_id', folderId)
    }
    ;({ data: docs, error: docError } = await fallback)
  }

  if (docError) {
    throw new Error(`Failed to resolve document scope: ${docError.message}`)
  }

  return {
    active: true,
    documentIds: [...new Set((docs ?? []).map((d) => d.id as string))],
  }
}

/** True when the request asked for a scope (tags and/or folder). */
export function hasDocumentScope(scope: ChatDocumentScope = {}): boolean {
  const tagIds = scope.tagIds ?? []
  return tagIds.length > 0 || (scope.folderId != null && scope.folderId !== '')
}
