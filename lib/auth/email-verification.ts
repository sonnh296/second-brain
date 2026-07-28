import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createVerificationToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  }
}

export async function storeEmailVerification(
  service: SupabaseClient,
  opts: { userId: string; email: string; tokenHash: string; expiresAt: string }
): Promise<void> {
  // Invalidate previous unused tokens for this user
  await service
    .from('email_verifications')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
    .is('used_at', null)

  const { error } = await service.from('email_verifications').insert({
    user_id: opts.userId,
    email: opts.email.toLowerCase(),
    token_hash: opts.tokenHash,
    expires_at: opts.expiresAt,
  })
  if (error) throw error
}

export async function consumeEmailVerification(
  service: SupabaseClient,
  token: string
): Promise<{ userId: string; email: string } | null> {
  const tokenHash = hashVerificationToken(token)
  const { data, error } = await service
    .from('email_verifications')
    .select('id, user_id, email, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !data || data.used_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null

  await service
    .from('email_verifications')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id)

  return { userId: data.user_id, email: data.email }
}
