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

  return NextResponse.json({
    classroom,
    role: membership.role,
    lessons: lessons ?? [],
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
