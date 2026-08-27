export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(user.id, 'classroom-join', 10, 60, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many join attempts' }, { status: 429 })
  }

  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const code = body.code?.trim()
  if (!code) {
    return NextResponse.json({ error: 'Mã lớp là bắt buộc' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('join_classroom_by_code', { p_code: code })
  if (error) {
    const msg = error.message.includes('Invalid join code')
      ? 'Mã lớp không hợp lệ'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ classroom_id: data as string }, { status: 201 })
}
