import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'

const CreateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional().default('Cuộc trò chuyện mới'),
})

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

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

  const { searchParams } = req.nextUrl
  const rawLimit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT
  const rawOffset = Number(searchParams.get('offset') ?? 0)
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100)

  // Cleanup stale empty sessions on first page load only
  if (offset === 0 && !q) {
    const { data: empties } = await supabase
      .from('chat_sessions')
      .select('id, created_at, messages(id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    const now = Date.now()
    const STALE_EMPTY_MS = 30 * 60 * 1000
    const emptyIds = (empties ?? [])
      .filter((s) => !s.messages || s.messages.length === 0)
      .filter((s) => now - new Date(s.created_at).getTime() > STALE_EMPTY_MS)
      .map((s) => s.id)

    if (emptyIds.length > 0) {
      await supabase.from('chat_sessions').delete().in('id', emptyIds).eq('user_id', user.id)
    }
  }

  // !inner → only sessions that already have messages (drafts are client-only)
  // Fetch limit+1 to detect has_more without a fragile join count
  let query = supabase
    .from('chat_sessions')
    .select('id, title, created_at, messages!inner(id)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)

  if (q) {
    // Escape LIKE wildcards in user input
    const escaped = q.replace(/[%_\\]/g, '\\$&')
    query = query.ilike('title', `%${escaped}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  const rows = data ?? []
  const hasMore = rows.length > limit
  const sessions = rows.slice(0, limit).map(({ id, title, created_at }) => ({
    id,
    title,
    created_at,
  }))

  return NextResponse.json({ sessions, has_more: hasMore })
}
