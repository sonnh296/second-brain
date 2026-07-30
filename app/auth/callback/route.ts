import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceSupabaseClient } from '@/lib/db/server'
import { withSessionMaxAge } from '@/lib/auth/session'
import { isValidUsername, normalizeUsername } from '@/lib/auth/username'
import { logger } from '@/lib/logger'

function appOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || req.nextUrl.origin
}

function usernameFromGoogleUser(email: string | undefined, meta: Record<string, unknown>): string {
  const fromMeta =
    typeof meta.user_name === 'string'
      ? meta.user_name
      : typeof meta.preferred_username === 'string'
        ? meta.preferred_username
        : typeof meta.full_name === 'string'
          ? meta.full_name
          : ''
  const base = normalizeUsername(
    (fromMeta || email?.split('@')[0] || 'user')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, 32)
  )
  if (isValidUsername(base)) return base
  return `user_${Date.now().toString(36).slice(-8)}`
}

/**
 * OAuth callback — exchange code for session, ensure profile exists.
 */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req)
  const code = req.nextUrl.searchParams.get('code')
  const oauthError = req.nextUrl.searchParams.get('error')

  if (oauthError || !code) {
    return NextResponse.redirect(new URL('/login?error=oauth_denied', origin))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withSessionMaxAge(options) as typeof options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    logger.error('OAuth exchangeCodeForSession failed', { err: error })
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin))
  }

  const service = createServiceSupabaseClient()
  const { data: profile } = await service
    .from('profiles')
    .select('id, username, role, disabled_at')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profile?.disabled_at) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=account_disabled', origin))
  }

  if (!profile) {
    let username = usernameFromGoogleUser(
      data.user.email,
      (data.user.user_metadata ?? {}) as Record<string, unknown>
    )
    // Avoid unique collisions
    for (let i = 0; i < 5; i++) {
      const candidate = i === 0 ? username : `${username.slice(0, 24)}_${i}`
      const { error: upsertErr } = await service.from('profiles').upsert(
        { id: data.user.id, username: candidate, role: 'user' },
        { onConflict: 'id' }
      )
      if (!upsertErr) break
      if (i === 4) {
        logger.error('OAuth profile upsert failed', { err: upsertErr, userId: data.user.id })
      }
    }
  }

  const role = profile?.role ?? 'user'
  const dest = role === 'admin' ? '/admin' : '/documents'
  return NextResponse.redirect(new URL(dest, origin))
}
