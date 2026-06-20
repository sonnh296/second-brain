import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from '@/lib/auth/username'
import { withSessionMaxAge } from '@/lib/auth/session'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const LoginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const username = normalizeUsername(parsed.data.username)
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: 'Tên đăng nhập không hợp lệ (3–32 ký tự, chữ thường, số, _)' },
      { status: 400 }
    )
  }

  const clientIp = getClientIp(req)
  const [ipRl, userRl] = await Promise.all([
    checkRateLimit(`ip:${clientIp}`, 'login', 20, 900, { failClosed: true }),
    checkRateLimit(`user:${username}`, 'login', 5, 900, { failClosed: true }),
  ])
  if (!ipRl.allowed || !userRl.allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.' },
      { status: 429 }
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
    email: usernameToEmail(username),
    password: parsed.data.password,
  })

  if (error) {
    return NextResponse.json(
      { error: 'Sai tên đăng nhập hoặc mật khẩu' },
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
