import type { SupabaseClient } from '@supabase/supabase-js'

type FolderNode = { id: string; parent_id: string | null }

/**
 * Collect folder id + all descendant folder ids under the same owner.
 * Uses a single owner-scoped folder list, then BFS from root.
 */
export async function listFolderSubtreeIds(
  supabase: SupabaseClient,
  rootFolderId: string,
  ownerUserId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('id, parent_id')
    .eq('user_id', ownerUserId)

  if (error) {
    throw new Error(`Failed to load folder subtree: ${error.message}`)
  }

  const nodes = (data ?? []) as FolderNode[]
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.parent_id) continue
    const list = children.get(node.parent_id) ?? []
    list.push(node.id)
    children.set(node.parent_id, list)
  }

  const ids: string[] = []
  const stack = [rootFolderId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    for (const childId of children.get(id) ?? []) {
      stack.push(childId)
    }
  }
  return ids
}

/**
 * Walk up from folderId; return the nearest folder that is directly shared
 * with granteeUserId, or null if none.
 */
export async function findDirectShareRoot(
  supabase: SupabaseClient,
  folderId: string,
  granteeUserId: string
): Promise<string | null> {
  const visited = new Set<string>()
  let currentId: string | null = folderId

  for (let depth = 0; depth < 64 && currentId; depth += 1) {
    const id: string = currentId
    if (visited.has(id)) return null
    visited.add(id)

    const shareResult = await supabase
      .from('folder_shares')
      .select('folder_id')
      .eq('folder_id', id)
      .eq('grantee_id', granteeUserId)
      .maybeSingle()

    if (shareResult.data) return id

    const folderResult = await supabase
      .from('folders')
      .select('parent_id')
      .eq('id', id)
      .maybeSingle()

    if (folderResult.error || !folderResult.data) return null
    currentId = folderResult.data.parent_id as string | null
  }

  return null
}
