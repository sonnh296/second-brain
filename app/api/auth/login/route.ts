import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceSupabaseClient } from '@/lib/db/server'
import {
  isValidUsername,
  normalizeUsername,
} from '@/lib/auth/username'
import { resolveLoginEmail, looksLikeEmail } from '@/lib/auth/resolve-login'
import { withSessionMaxAge } from '@/lib/auth/session'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const LoginSchema = z.object({
  /** Username or email */
  identifier: z.string().min(3).max(254).optional(),
  /** @deprecated use identifier — kept for older clients */
  username: z.string().min(3).max(254).optional(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const identifier = (parsed.data.identifier ?? parsed.data.username ?? '').trim()
  if (!identifier) {
    return NextResponse.json({ error: 'Vui lòng nhập tên đăng nhập hoặc email' }, { status: 400 })
  }

  if (!looksLikeEmail(identifier)) {
    const username = normalizeUsername(identifier)
    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: 'Tên đăng nhập không hợp lệ (3–32 ký tự, chữ thường, số, _)' },
        { status: 400 }
      )
    }
  }

  const clientIp = getClientIp(req)
  const rateKey = looksLikeEmail(identifier)
    ? identifier.toLowerCase()
    : normalizeUsername(identifier)
  const [ipRl, userRl] = await Promise.all([
    checkRateLimit(`ip:${clientIp}`, 'login', 20, 900, { failClosed: true }),
    checkRateLimit(`user:${rateKey}`, 'login', 5, 900, { failClosed: true }),
  ])
  if (!ipRl.allowed || !userRl.allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.' },
      { status: 429 }
    )
  }

  const service = createServiceSupabaseClient()
  const email = await resolveLoginEmail(service, identifier)
  if (!email) {
    return NextResponse.json(
      { error: 'Sai tên đăng nhập/email hoặc mật khẩu' },
      { status: 401 }
    )
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  })

  if (error) {
    const msg = error.message?.toLowerCase() ?? ''
    if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
      return NextResponse.json(
        {
          error: 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.',
          code: 'email_not_confirmed',
        },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { error: 'Sai tên đăng nhập/email hoặc mật khẩu' },
      { status: 401 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  const role = profile?.role ?? 'user'

  return NextResponse.json({
    ok: true,
    role,
  })
}
