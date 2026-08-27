export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember, requireTeacher } from '@/lib/classroom/acl'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const lessonId = req.nextUrl.searchParams.get('lesson_id')

  let query = supabase
    .from('review_sets')
    .select('id, title, set_type, status, metadata, lesson_id, created_at')
    .eq('classroom_id', id)
    .order('created_at', { ascending: false })

  if (lessonId) {
    query = query.eq('lesson_id', lessonId)
  } else {
    query = query.is('lesson_id', null)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sets: data ?? [], role: membership.role })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
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
    set_type?: 'flashcard' | 'quiz'
    lesson_id?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }

  if (body.lesson_id) {
    const { data: lesson } = await supabase
      .from('classroom_lessons')
      .select('id')
      .eq('id', body.lesson_id)
      .eq('classroom_id', id)
      .maybeSingle()
    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('review_sets')
    .insert({
      classroom_id: id,
      title: body.title.trim().slice(0, 200),
      set_type: body.set_type ?? 'flashcard',
      status: 'draft',
      created_by: user.id,
      lesson_id: body.lesson_id ?? null,
    })
    .select('id, title, set_type, status, lesson_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
