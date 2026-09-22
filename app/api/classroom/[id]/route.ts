export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember, requireTeacher, generateJoinCode } from '@/lib/classroom/acl'

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

  const { data: classroom, error } = await supabase
    .from('classrooms')
    .select('id, name, join_code, created_by, settings, created_at')
    .eq('id', id)
    .single()

  if (error || !classroom) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [{ data: lessons }, { data: sharedFolder }, { data: members }] = await Promise.all([
    supabase
      .from('classroom_lessons')
      .select('id, lesson_index, title, created_at')
      .eq('classroom_id', id)
      .is('deleted_at', null)
      .order('lesson_index', { ascending: false }),
    supabase
      .from('classroom_folders')
      .select('id, name, kind')
      .eq('classroom_id', id)
      .eq('kind', 'shared_pinned')
      .maybeSingle(),
    supabase
      .from('classroom_members')
      .select('user_id, role, joined_at')
      .eq('classroom_id', id),
  ])

  const userIds = (members ?? []).map((m) => m.user_id)
  let profiles: { id: string; username: string }[] = []
  if (userIds.length > 0) {
    const { createServiceSupabaseClient } = await import('@/lib/db/server')
    const admin = createServiceSupabaseClient()
    const { data } = await admin.from('profiles').select('id, username').in('id', userIds)
    profiles = data ?? []
  }

  const usernameById = new Map(profiles.map((p) => [p.id, p.username]))

  let lessonsOut = lessons ?? []

  // For students: count incomplete assignments per lesson (no submit / draft only)
  if (membership.role === 'student' && lessonsOut.length > 0) {
    const lessonIds = lessonsOut.map((l) => l.id)
    const { data: assigns } = await supabase
      .from('assignments')
      .select('id, lesson_id')
      .eq('classroom_id', id)
      .in('lesson_id', lessonIds)
      .is('deleted_at', null)

    const assignList = assigns ?? []
    const assignIds = assignList.map((a) => a.id)
    const { data: subs } =
      assignIds.length > 0
        ? await supabase
            .from('assignment_submissions')
            .select('assignment_id, status')
            .eq('student_id', user.id)
            .in('assignment_id', assignIds)
        : { data: [] as { assignment_id: string; status: string }[] }

    const subByAssign = new Map((subs ?? []).map((s) => [s.assignment_id, s.status]))
    const incompleteByLesson = new Map<string, number>()
    for (const a of assignList) {
      const st = subByAssign.get(a.id)
      const done = st === 'submitted' || st === 'graded'
      if (!done) {
        incompleteByLesson.set(a.lesson_id, (incompleteByLesson.get(a.lesson_id) ?? 0) + 1)
      }
    }

    lessonsOut = lessonsOut.map((l) => ({
      ...l,
      incomplete_assignments: incompleteByLesson.get(l.id) ?? 0,
    }))
  }

  return NextResponse.json({
    classroom,
    role: membership.role,
    lessons: lessonsOut,
    shared_folder: sharedFolder,
    members: (members ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      username: usernameById.get(m.user_id) ?? null,
    })),
  })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  let body: { name?: string; rotate_code?: boolean; archive?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name?.trim()) updates.name = body.name.trim().slice(0, 120)
  if (body.rotate_code) updates.join_code = generateJoinCode()
  if (body.archive === true) updates.archived_at = new Date().toISOString()
  if (body.archive === false) updates.archived_at = null

  const { data, error } = await supabase
    .from('classrooms')
    .update(updates)
    .eq('id', id)
    .select('id, name, join_code, archived_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
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

  const { error } = await supabase.from('classrooms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
