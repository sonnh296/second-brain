import type { SupabaseClient } from '@supabase/supabase-js'

const FAILED_DOCS_LIMIT = 100

export type AdminFailedDocument = {
  id: string
  user_id: string
  username: string
  filename: string
  file_type: string
  file_size_bytes: number
  error_message: string | null
  created_at: string
}

export type AdminFailedDocumentsResult = {
  items: AdminFailedDocument[]
  total: number
}

export async function getAdminFailedDocuments(
  service: SupabaseClient
): Promise<AdminFailedDocumentsResult> {
  const [{ data: docs, error: docsError }, { count, error: countError }] =
    await Promise.all([
      service
        .from('documents')
        .select(
          'id, user_id, filename, file_type, file_size_bytes, error_message, created_at'
        )
        .eq('status', 'failed')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(FAILED_DOCS_LIMIT),
      service
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .is('deleted_at', null),
    ])

  if (docsError) throw docsError
  if (countError) throw countError

  const rows = docs ?? []
  const userIds = [...new Set(rows.map((d) => d.user_id as string))]

  const usernameById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await service
      .from('profiles')
      .select('id, username')
      .in('id', userIds)
    if (profilesError) throw profilesError
    for (const p of profiles ?? []) {
      usernameById.set(p.id as string, (p.username as string) ?? '')
    }
  }

  const items: AdminFailedDocument[] = rows.map((d) => ({
    id: d.id as string,
    user_id: d.user_id as string,
    username: usernameById.get(d.user_id as string) || '—',
    filename: d.filename as string,
    file_type: d.file_type as string,
    file_size_bytes: (d.file_size_bytes as number) ?? 0,
    error_message: (d.error_message as string | null) ?? null,
    created_at: d.created_at as string,
  }))

  return {
    items,
    total: count ?? items.length,
  }
}
