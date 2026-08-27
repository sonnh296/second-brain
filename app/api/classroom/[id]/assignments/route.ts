export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import {
  CLASSROOM_ASSIGNMENT_MAX_BYTES,
  isAclError,
  requireMember,
  requireTeacher,
} from '@/lib/classroom/acl'

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

  const { data: assignments, error } = await supabase
    .from('assignments')
    .select(
      'id, lesson_id, title, description, due_at, max_file_bytes, max_score, created_at, classroom_lessons(lesson_index, title)'
    )
    .eq('classroom_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = assignments ?? []
  if (membership.role === 'student') {
    const ids = list.map((a) => a.id)
    const { data: subs } =
      ids.length > 0
        ? await supabase
            .from('assignment_submissions')
            .select('id, assignment_id, status, submitted_at, grades(score, comment, method)')
            .eq('student_id', user.id)
            .in('assignment_id', ids)
        : { data: [] as never[] }

    const byAssignment = new Map((subs ?? []).map((s) => [s.assignment_id, s]))
    return NextResponse.json({
      role: membership.role,
      assignments: list.map((a) => ({
        ...a,
        my_submission: byAssignment.get(a.id) ?? null,
      })),
    })
  }

  return NextResponse.json({ role: membership.role, assignments: list })
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
    lesson_id?: string
    title?: string
    description?: string
    due_at?: string | null
    max_score?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.lesson_id || !body.title?.trim()) {
    return NextResponse.json({ error: 'lesson_id and title required' }, { status: 400 })
  }

  const { data: lesson } = await supabase
    .from('classroom_lessons')
    .select('id')
    .eq('id', body.lesson_id)
    .eq('classroom_id', id)
    .single()
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 400 })

  const { data, error } = await supabase
    .from('assignments')
    .insert({
      classroom_id: id,
      lesson_id: body.lesson_id,
      title: body.title.trim().slice(0, 200),
      description: body.description?.trim() || null,
      due_at: body.due_at || null,
      max_file_bytes: CLASSROOM_ASSIGNMENT_MAX_BYTES,
      max_score: body.max_score ?? 10,
      created_by: user.id,
    })
    .select('id, lesson_id, title, description, due_at, max_file_bytes, max_score')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Buổi này đã có bài tập' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
