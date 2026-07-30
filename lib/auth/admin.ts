import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  username: string
  role: 'user' | 'admin'
  created_at: string
  disabled_at: string | null
}

export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role, created_at, disabled_at')
    .eq('id', userId)
    .maybeSingle()

  if (error && (error.code === '42703' || error.message?.includes('disabled_at'))) {
    const { data: fallback } = await supabase
      .from('profiles')
      .select('id, username, role, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (!fallback) return null
    return { ...fallback, disabled_at: null } as UserProfile
  }

  if (data) {
    return {
      ...(data as Omit<UserProfile, 'disabled_at'>),
      disabled_at: (data as { disabled_at?: string | null }).disabled_at ?? null,
    }
  }
  return null
}

/** Map auth user to profile — role always comes from profiles table. */
export function profileFromAuthUser(
  user: User,
  profile?: Pick<UserProfile, 'username' | 'role' | 'created_at' | 'disabled_at'> | null
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
    disabled_at: profile?.disabled_at ?? null,
  }
}

export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const profile = await getUserProfile(supabase, userId)
  return profile?.role === 'admin'
}

/** True when the account has been soft-disabled by an admin. */
export async function isUserDisabled(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const profile = await getUserProfile(supabase, userId)
  return profile?.disabled_at != null
}

/** List auth users with roles sourced from profiles (not user_metadata). */
export async function listUsersWithProfiles(
  service: SupabaseClient
): Promise<UserProfile[]> {
  const { data: listData, error } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error

  const authUsers = listData?.users ?? []
  if (authUsers.length === 0) return []

  const ids = authUsers.map((u) => u.id)
  let { data: profiles, error: profileErr } = await service
    .from('profiles')
    .select('id, username, role, created_at, disabled_at')
    .in('id', ids)

  if (profileErr && (profileErr.code === '42703' || profileErr.message?.includes('disabled_at'))) {
    const fallback = await service
      .from('profiles')
      .select('id, username, role, created_at')
      .in('id', ids)
    profiles = (fallback.data ?? []).map((p) => ({ ...p, disabled_at: null }))
  }

  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      {
        ...p,
        disabled_at: (p as { disabled_at?: string | null }).disabled_at ?? null,
      },
    ])
  )

  return authUsers
    .map((u) => profileFromAuthUser(u, profileById.get(u.id)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
