export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember, requireTeacher } from '@/lib/classroom/acl'

type Ctx = { params: Promise<{ id: string; assignmentId: string }> }

async function requireAssignmentInClass(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  classroomId: string,
  assignmentId: string
) {
  const { data } = await supabase
    .from('assignments')
    .select('id')
    .eq('id', assignmentId)
    .eq('classroom_id', classroomId)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, assignmentId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const assignment = await requireAssignmentInClass(supabase, id, assignmentId)
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: comments, error } = await supabase
    .from('assignment_comments')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id))]
  let names = new Map<string, string>()
  if (authorIds.length > 0) {
    const admin = createServiceSupabaseClient()
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username')
      .in('id', authorIds)
    names = new Map((profiles ?? []).map((p) => [p.id, p.username]))
  }

  let studentSubmissionId: string | null = null
  if (membership.role === 'student') {
    const { data: sub } = await supabase
      .from('assignment_submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .maybeSingle()
    studentSubmissionId = sub?.id ?? null
  }

  const visible =
    membership.role === 'teacher'
      ? comments ?? []
      : (comments ?? []).filter(
          (c) =>
            c.submission_id == null ||
            (studentSubmissionId != null && c.submission_id === studentSubmissionId)
        )

  return NextResponse.json({
    comments: visible.map((c) => ({
      ...c,
      author_name: names.get(c.author_id) ?? null,
    })),
  })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, assignmentId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  if (membership.role !== 'teacher') {
    return NextResponse.json({ error: 'Teacher only' }, { status: 403 })
  }

  const assignment = await requireAssignmentInClass(supabase, id, assignmentId)
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { body?: string; quote_text?: string; submission_id?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  if (body.submission_id) {
    const { data: sub } = await supabase
      .from('assignment_submissions')
      .select('id')
      .eq('id', body.submission_id)
      .eq('assignment_id', assignmentId)
      .single()
    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('assignment_comments')
    .insert({
      assignment_id: assignmentId,
      submission_id: body.submission_id ?? null,
      author_id: user.id,
      quote_text: (body.quote_text ?? '').trim().slice(0, 500),
      body: body.body.trim().slice(0, 4000),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, assignmentId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const assignment = await requireAssignmentInClass(supabase, id, assignmentId)
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { comment_id?: string; resolve?: boolean; delete?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.comment_id) {
    return NextResponse.json({ error: 'comment_id required' }, { status: 400 })
  }

  if (body.delete) {
    const { error } = await supabase
      .from('assignment_comments')
      .delete()
      .eq('id', body.comment_id)
      .eq('assignment_id', assignmentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.resolve) {
    const { data, error } = await supabase
      .from('assignment_comments')
      .update({ resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', body.comment_id)
      .eq('assignment_id', assignmentId)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
