export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember, requireTeacher } from '@/lib/classroom/acl'

type Ctx = { params: Promise<{ id: string; setId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, setId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const { data: set } = await supabase
    .from('review_sets')
    .select('*')
    .eq('id', setId)
    .eq('classroom_id', id)
    .single()

  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: items } = await supabase
    .from('review_items')
    .select('*')
    .eq('review_set_id', setId)
    .order('sort_order')

  // Hide answers from students until after attempt for quiz items
  const ANSWER_KEYS = [
    'answer',
    'accepted_answers',
    'correct',
    'correct_index',
    'correct_option',
    'correct_options',
    'explanation',
  ] as const
  const safeItems =
    membership.role === 'teacher'
      ? items ?? []
      : (items ?? []).map((item) => {
          if (item.item_type === 'flashcard') return item
          const payload = { ...(item.payload as Record<string, unknown>) }
          for (const key of ANSWER_KEYS) delete payload[key]
          return { ...item, payload }
        })

  let myAttempts: unknown[] = []
  if (membership.role === 'student') {
    const { data } = await supabase
      .from('review_attempts')
      .select('id, score, max_score, tab_blur_count, status, submitted_at, started_at')
      .eq('review_set_id', setId)
      .eq('student_id', user.id)
      .order('started_at', { ascending: false })
    myAttempts = data ?? []
  } else {
    const { data } = await supabase
      .from('review_attempts')
      .select('id, student_id, score, max_score, tab_blur_count, status, submitted_at')
      .eq('review_set_id', setId)
      .order('submitted_at', { ascending: false })
    myAttempts = data ?? []
  }

  return NextResponse.json({
    set,
    items: safeItems,
    attempts: myAttempts,
    role: membership.role,
  })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, setId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  let body: {
    title?: string
    status?: 'draft' | 'published' | 'archived'
    items?: {
      id?: string
      item_type: 'flashcard' | 'mcq' | 'written'
      prompt: string
      payload: Record<string, unknown>
      sort_order?: number
    }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title?.trim()) updates.title = body.title.trim()
  if (body.status) updates.status = body.status

  await supabase.from('review_sets').update(updates).eq('id', setId).eq('classroom_id', id)

  if (body.items) {
    await supabase.from('review_items').delete().eq('review_set_id', setId)
    if (body.items.length > 0) {
      await supabase.from('review_items').insert(
        body.items.map((item, i) => ({
          review_set_id: setId,
          item_type: item.item_type,
          prompt: item.prompt,
          payload: { schema_version: 1, ...item.payload },
          sort_order: item.sort_order ?? i,
        }))
      )
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id, setId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const { error } = await supabase
    .from('review_sets')
    .delete()
    .eq('id', setId)
    .eq('classroom_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
