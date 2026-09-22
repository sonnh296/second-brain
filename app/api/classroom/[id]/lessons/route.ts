export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { createLesson } from '@/lib/classroom/create'
import { isAclError, requireMember, requireTeacher } from '@/lib/classroom/acl'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
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

  const { data, error } = await supabase
    .from('classroom_lessons')
    .select('id, lesson_index, title, created_at')
    .eq('classroom_id', id)
    .is('deleted_at', null)
    .order('lesson_index', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lessons: data ?? [] })
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

  let title: string | undefined
  try {
    const body = await req.json()
    if (typeof body?.title === 'string') title = body.title
  } catch {
    // empty body → default title from RPC
  }

  const result = await createLesson(supabase, id, title)
  if (result.error || !result.lesson) {
    const status = result.error === 'Tên buổi không hợp lệ' ? 400 : 500
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status })
  }
  return NextResponse.json(result.lesson, { status: 201 })
}
