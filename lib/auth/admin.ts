import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  username: string
  role: 'user' | 'admin'
  created_at: string
}

export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, role, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (data) return data as UserProfile
  return null
}

/** Map auth user to profile — role always comes from profiles table. */
export function profileFromAuthUser(
  user: User,
  profile?: Pick<UserProfile, 'username' | 'role' | 'created_at'> | null
): UserProfile {
  return {
    id: user.id,
    username:
      profile?.username ??
      (user.user_metadata?.username as string) ??
      user.email?.split('@')[0] ??
      'unknown',
    role: profile?.role ?? 'user',
    created_at: profile?.created_at ?? user.created_at,
  }
}

export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const profile = await getUserProfile(supabase, userId)
  return profile?.role === 'admin'
}

/** List auth users with roles sourced from profiles (not user_metadata). */
export async function listUsersWithProfiles(
  service: SupabaseClient
): Promise<UserProfile[]> {
  const { data: listData, error } = await service.auth.admin.listUsers()
  if (error) throw error

  const authUsers = (listData?.users ?? []).filter((u) =>
    u.email?.endsWith('@users.secondbrain.local')
  )
  if (authUsers.length === 0) return []

  const ids = authUsers.map((u) => u.id)
  const { data: profiles } = await service
    .from('profiles')
    .select('id, username, role, created_at')
    .in('id', ids)

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return authUsers
    .map((u) => profileFromAuthUser(u, profileById.get(u.id)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
