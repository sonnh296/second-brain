import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from '@/lib/auth/username'

export function looksLikeEmail(value: string): boolean {
  return value.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * Resolve a login identifier (username or email) to the auth email used by Supabase.
 * Supports legacy synthetic emails and real-email signups.
 */
export async function resolveLoginEmail(
  service: SupabaseClient,
  identifier: string
): Promise<string | null> {
  const raw = identifier.trim()
  if (!raw) return null

  if (looksLikeEmail(raw)) {
    return raw.toLowerCase()
  }

  const username = normalizeUsername(raw)
  if (!isValidUsername(username)) return null

  const { data: profile } = await service
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (profile?.id) {
    const { data } = await service.auth.admin.getUserById(profile.id)
    if (data.user?.email) return data.user.email
  }

  // Legacy admin-provisioned accounts
  return usernameToEmail(username)
}
