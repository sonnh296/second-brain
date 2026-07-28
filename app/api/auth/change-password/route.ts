import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
})

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Mật khẩu mới phải có ít nhất 6 ký tự' },
      { status: 400 }
    )
  }

  const { currentPassword, newPassword } = parsed.data
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'Mật khẩu mới phải khác mật khẩu hiện tại' },
      { status: 400 }
    )
  }

  const clientIp = getClientIp(req)
  const rl = await checkRateLimit(
    `user:${user.id}`,
    'change-password',
    5,
    900,
    { failClosed: true }
  )
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều lần thử. Vui lòng thử lại sau.' },
      { status: 429 }
    )
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (verifyError) {
    return NextResponse.json(
      { error: 'Mật khẩu hiện tại không đúng' },
      { status: 401 }
    )
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Đổi mật khẩu thất bại' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
