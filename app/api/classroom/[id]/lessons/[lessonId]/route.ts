export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember, requireTeacher } from '@/lib/classroom/acl'
import { softDeleteClassroomLesson } from '@/lib/classroom/soft-delete'
import { hardDeleteClassroomLesson } from '@/lib/classroom/hard-delete'

type Ctx = { params: Promise<{ id: string; lessonId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, lessonId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const { data: lesson, error } = await supabase
    .from('classroom_lessons')
    .select('id, lesson_index, title, created_at, deleted_at')
    .eq('id', lessonId)
    .eq('classroom_id', id)
    .is('deleted_at', null)
    .single()

  if (error || !lesson) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [{ data: folder }, { data: assignments }] = await Promise.all([
    supabase
      .from('classroom_folders')
      .select('id, name, kind')
      .eq('lesson_id', lessonId)
      .eq('kind', 'lesson_materials')
      .maybeSingle(),
    supabase
      .from('assignments')
      .select('id, title, description, due_at, max_file_bytes, max_score, created_at')
      .eq('lesson_id', lessonId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  let documents: unknown[] = []
  if (folder) {
    const { data: docs } = await supabase
      .from('classroom_documents')
      .select(
        'id, filename, file_type, file_size_bytes, status, chunk_count, error_message, created_at, uploaded_by'
      )
      .eq('folder_id', folder.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    documents = docs ?? []
  }

  return NextResponse.json({
    lesson,
    role: membership.role,
    folder,
    documents,
    assignments: assignments ?? [],
    assignment: assignments?.[0] ?? null,
  })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, lessonId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  let body: { title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const title = body.title?.trim()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabase
    .from('classroom_lessons')
    .update({ title: title.slice(0, 200), updated_at: new Date().toISOString() })
    .eq('id', lessonId)
    .eq('classroom_id', id)
    .is('deleted_at', null)
    .select('id, lesson_index, title')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, lessonId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const permanent = req.nextUrl.searchParams.get('permanent') === '1'

  if (permanent) {
    const result = await hardDeleteClassroomLesson(supabase, id, lessonId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, permanent: true })
  }

  const result = await softDeleteClassroomLesson(supabase, id, lessonId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, trashed: true })
}
