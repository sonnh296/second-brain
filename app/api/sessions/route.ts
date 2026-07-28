import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'

const CreateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional().default('Cuộc trò chuyện mới'),
})

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = CreateSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ user_id: user.id, title: parsed.data.title })
    .select('id, title, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at, messages(id)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  const sessions = data ?? []
  const now = Date.now()
  const STALE_EMPTY_MS = 30 * 60 * 1000

  const emptyIds = sessions
    .filter((s) => !s.messages || s.messages.length === 0)
    .filter((s) => now - new Date(s.created_at).getTime() > STALE_EMPTY_MS)
    .map((s) => s.id)

  if (emptyIds.length > 0) {
    await supabase
      .from('chat_sessions')
      .delete()
      .in('id', emptyIds)
      .eq('user_id', user.id)
  }

  // Only return sessions that already have messages (drafts are client-only)
  const withMessages = sessions
    .filter((s) => s.messages && s.messages.length > 0)
    .map(({ id, title, created_at }) => ({ id, title, created_at }))

  return NextResponse.json(withMessages)
}
