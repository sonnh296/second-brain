import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { withSessionMaxAge } from '@/lib/auth/session'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

/** Start Google OAuth — redirects to Google via Supabase. */
export async function GET(req: NextRequest) {
  const clientIp = getClientIp(req)
  const rl = await checkRateLimit(`ip:${clientIp}`, 'oauth', 20, 900, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || req.nextUrl.origin
  const redirectTo = `${origin}/auth/callback`

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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL('/login?error=oauth_unavailable', origin)
    )
  }

  return NextResponse.redirect(data.url)
}
