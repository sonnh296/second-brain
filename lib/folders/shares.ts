import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isValidUsername,
  normalizeUsername,
} from '@/lib/auth/username'
import { looksLikeEmail } from '@/lib/auth/resolve-login'

export type FolderSharePermission = 'viewer'

export type FolderShareRow = {
  id: string
  folder_id: string
  owner_id: string
  grantee_id: string
  permission: FolderSharePermission
  created_at: string
}

export type FolderShareWithGrantee = FolderShareRow & {
  grantee_username: string | null
}

export type SharedFolderListItem = {
  id: string
  name: string
  color: string
  description: string | null
  parent_id: string | null
  user_id: string
  created_at: string
  updated_at: string
  share_id: string
  shared_at: string
  shared_by: {
    id: string
    username: string | null
  }
}

async function resolveGranteeByEmail(
  service: SupabaseClient,
  email: string
): Promise<{ id: string; username: string | null } | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return null

  const url = new URL('/auth/v1/admin/users', base)
  url.searchParams.set('email', email)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    cache: 'no-store',
  })
  if (!res.ok) return null

  const body = (await res.json()) as {
    users?: { id: string; email?: string }[]
    id?: string
  }
  const user =
    body.users?.find((u) => u.email?.toLowerCase() === email) ??
    (body.id ? { id: body.id, email } : undefined)
  if (!user?.id) return null

  const { data: profile } = await service
    .from('profiles')
    .select('id, username')
    .eq('id', user.id)
    .maybeSingle()
  return { id: user.id, username: profile?.username ?? null }
}

/** Resolve invite target by username (preferred) or email. */
export async function resolveShareGrantee(
  service: SupabaseClient,
  identifier: string
): Promise<{ id: string; username: string | null } | null> {
  const raw = identifier.trim()
  if (!raw) return null

  if (looksLikeEmail(raw)) {
    return resolveGranteeByEmail(service, raw.toLowerCase())
  }

  const username = normalizeUsername(raw)
  if (!isValidUsername(username)) return null

  const { data: profile } = await service
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle()

  if (!profile?.id) return null
  return { id: profile.id, username: profile.username ?? username }
}

export async function assertFolderOwned(
  supabase: SupabaseClient,
  folderId: string,
  userId: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from('folders')
    .select('id, name')
    .eq('id', folderId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export async function listFolderShares(
  supabase: SupabaseClient,
  folderId: string,
  ownerId: string
): Promise<FolderShareWithGrantee[]> {
  const { data: shares, error } = await supabase
    .from('folder_shares')
    .select('id, folder_id, owner_id, grantee_id, permission, created_at')
    .eq('folder_id', folderId)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!shares?.length) return []

  const granteeIds = [...new Set(shares.map((s) => s.grantee_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', granteeIds)

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.username as string | null) ?? null])
  )

  return shares.map((s) => ({
    ...(s as FolderShareRow),
    grantee_username: nameById.get(s.grantee_id) ?? null,
  }))
}

export async function listFoldersSharedWithMe(
  supabase: SupabaseClient,
  granteeId: string
): Promise<SharedFolderListItem[]> {
  const { data: shares, error } = await supabase
    .from('folder_shares')
    .select('id, folder_id, owner_id, created_at')
    .eq('grantee_id', granteeId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!shares?.length) return []

  const folderIds = shares.map((s) => s.folder_id)
  const ownerIds = [...new Set(shares.map((s) => s.owner_id))]

  const [{ data: folders }, { data: profiles }] = await Promise.all([
    supabase
      .from('folders')
      .select('id, parent_id, name, color, description, user_id, created_at, updated_at')
      .in('id', folderIds),
    supabase.from('profiles').select('id, username').in('id', ownerIds),
  ])

  const folderById = new Map((folders ?? []).map((f) => [f.id as string, f]))
  const ownerById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.username as string | null) ?? null])
  )

  const items: SharedFolderListItem[] = []
  for (const share of shares) {
    const folder = folderById.get(share.folder_id)
    if (!folder) continue
    items.push({
      id: folder.id as string,
      name: folder.name as string,
      color: (folder.color as string) ?? '#f59e0b',
      description: (folder.description as string | null) ?? null,
      parent_id: (folder.parent_id as string | null) ?? null,
      user_id: folder.user_id as string,
      created_at: folder.created_at as string,
      updated_at: folder.updated_at as string,
      share_id: share.id as string,
      shared_at: share.created_at as string,
      shared_by: {
        id: share.owner_id as string,
        username: ownerById.get(share.owner_id as string) ?? null,
      },
    })
  }
  return items
}
