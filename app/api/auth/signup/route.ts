import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceSupabaseClient } from '@/lib/db/server'
import { isValidUsername, normalizeUsername } from '@/lib/auth/username'
import { looksLikeEmail } from '@/lib/auth/resolve-login'
import {
  createVerificationToken,
  storeEmailVerification,
} from '@/lib/auth/email-verification'
import { sendSignupConfirmationEmail } from '@/lib/mail/smtp'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const SignupSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
})

function appOrigin(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    req.nextUrl.origin
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = SignupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const username = normalizeUsername(parsed.data.username)
  const email = parsed.data.email.trim().toLowerCase()
  const password = parsed.data.password

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: 'Tên đăng nhập không hợp lệ (3–32 ký tự, chữ thường, số, _)' },
      { status: 400 }
    )
  }
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
  }

  const clientIp = getClientIp(req)
  const [ipRl, emailRl] = await Promise.all([
    checkRateLimit(`ip:${clientIp}`, 'signup', 10, 3600, { failClosed: true }),
    checkRateLimit(`email:${email}`, 'signup', 5, 3600, { failClosed: true }),
  ])
  if (!ipRl.allowed || !emailRl.allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều lần đăng ký. Vui lòng thử lại sau.' },
      { status: 429 }
    )
  }

  const service = createServiceSupabaseClient()

  const { data: existingProfile } = await service
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (existingProfile) {
    return NextResponse.json({ error: 'Tên đăng nhập đã được sử dụng' }, { status: 409 })
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { username, role: 'user' },
  })

  if (createErr || !created.user) {
    const msg = createErr?.message?.toLowerCase() ?? ''
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return NextResponse.json({ error: 'Email đã được đăng ký' }, { status: 409 })
    }
    logger.error('Signup createUser failed', { err: createErr, email, username })
    return NextResponse.json({ error: 'Không tạo được tài khoản' }, { status: 500 })
  }

  // Ensure profile username (trigger may use email local-part)
  await service
    .from('profiles')
    .upsert({ id: created.user.id, username, role: 'user' }, { onConflict: 'id' })

  try {
    const { token, tokenHash, expiresAt } = createVerificationToken()
    await storeEmailVerification(service, {
      userId: created.user.id,
      email,
      tokenHash,
      expiresAt,
    })
    const confirmUrl = `${appOrigin(req)}/api/auth/confirm?token=${encodeURIComponent(token)}`
    await sendSignupConfirmationEmail({ to: email, username, confirmUrl })
  } catch (err) {
    logger.error('Signup verification email failed', { err, userId: created.user.id, email })
    // Roll back user so they can retry cleanly
    await service.auth.admin.deleteUser(created.user.id)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Không gửi được email xác nhận. Kiểm tra cấu hình SMTP.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    message: 'Đã gửi email xác nhận. Vui lòng kiểm tra hộp thư để kích hoạt tài khoản.',
  })
}
