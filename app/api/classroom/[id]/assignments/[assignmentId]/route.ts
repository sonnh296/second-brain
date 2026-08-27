export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/db/server'
import {
  CLASSROOM_ASSIGNMENT_MAX_BYTES,
  classroomSubmissionR2Key,
  isAclError,
  isOwnedSubmissionR2Key,
  requireMember,
  requireTeacher,
} from '@/lib/classroom/acl'
import { sanitizeFilename } from '@/lib/upload-limits'
import { mimeForType, typeFromExtension, BLOCKED_EXTENSIONS } from '@/lib/upload/file-types'
import { presignPutUrl, headObject } from '@/lib/storage'

type Ctx = { params: Promise<{ id: string; assignmentId: string }> }

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

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('classroom_id', id)
    .single()
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (membership.role === 'teacher') {
    const { data: submissions } = await supabase
      .from('assignment_submissions')
      .select('*, grades(*)')
      .eq('assignment_id', assignmentId)
      .order('submitted_at', { ascending: false })

    const studentIds = (submissions ?? []).map((s) => s.student_id)
    let profiles: { id: string; username: string }[] = []
    if (studentIds.length > 0) {
      const { createServiceSupabaseClient } = await import('@/lib/db/server')
      const admin = createServiceSupabaseClient()
      const { data } = await admin.from('profiles').select('id, username').in('id', studentIds)
      profiles = data ?? []
    }
    const names = new Map(profiles.map((p) => [p.id, p.username]))

    return NextResponse.json({
      role: 'teacher',
      assignment,
      submissions: (submissions ?? []).map((s) => ({
        ...s,
        username: names.get(s.student_id) ?? null,
      })),
    })
  }

  const { data: submission } = await supabase
    .from('assignment_submissions')
    .select('*, grades(*)')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  return NextResponse.json({ role: 'student', assignment, submission })
}

/** Student: get presign URL to upload submission file */
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
  if (membership.role !== 'student') {
    return NextResponse.json({ error: 'Students only' }, { status: 403 })
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, max_file_bytes')
    .eq('id', assignmentId)
    .eq('classroom_id', id)
    .single()
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { filename?: string; size?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const size = Number(body.size)
  const maxBytes = assignment.max_file_bytes ?? CLASSROOM_ASSIGNMENT_MAX_BYTES
  if (!body.filename || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'filename and size required' }, { status: 400 })
  }
  if (size > maxBytes) {
    return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 413 })
  }

  const filename = sanitizeFilename(body.filename)
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  const fileId = randomUUID()
  const fileType = typeFromExtension(filename) ?? 'file'
  const r2Key = classroomSubmissionR2Key(id, assignmentId, user.id, fileId, filename)
  const uploadUrl = await presignPutUrl(r2Key, mimeForType(fileType))

  return NextResponse.json({
    file_id: fileId,
    r2_key: r2Key,
    upload_url: uploadUrl,
    content_type: mimeForType(fileType),
    filename,
    file_type: fileType,
    size,
  })
}

/** Student completes submission after R2 PUT; teacher grades via PATCH */
export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  let body: {
    action?: 'submit' | 'grade'
    files?: { file_id: string; r2_key: string; filename: string; file_type: string; size: number }[]
    submission_id?: string
    score?: number
    comment?: string
    method?: 'manual' | 'ai'
    rubric_id?: string | null
    ai_suggestion?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (body.action === 'submit') {
    if (membership.role !== 'student') {
      return NextResponse.json({ error: 'Students only' }, { status: 403 })
    }

    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, max_file_bytes')
      .eq('id', assignmentId)
      .eq('classroom_id', id)
      .single()
    if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: existing } = await supabase
      .from('assignment_submissions')
      .select('id, status')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .maybeSingle()
    if (existing?.status === 'graded') {
      return NextResponse.json(
        { error: 'Bài đã được chấm — không thể nộp lại' },
        { status: 409 }
      )
    }

    const files = body.files ?? []
    if (files.length === 0) {
      return NextResponse.json({ error: 'files required' }, { status: 400 })
    }

    const maxBytes = assignment.max_file_bytes ?? CLASSROOM_ASSIGNMENT_MAX_BYTES
    const normalized: typeof files = []
    for (const f of files) {
      if (!f.file_id || !f.r2_key || !f.filename) {
        return NextResponse.json({ error: 'Invalid file entry' }, { status: 400 })
      }
      if (!isOwnedSubmissionR2Key(f.r2_key, id, assignmentId, user.id, f.file_id)) {
        return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 })
      }
      const head = await headObject(f.r2_key)
      if (!head) {
        return NextResponse.json({ error: `Missing upload: ${f.filename}` }, { status: 400 })
      }
      if (head.size > maxBytes) {
        return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 413 })
      }
      normalized.push({
        ...f,
        size: head.size,
        filename: sanitizeFilename(f.filename),
      })
    }

    const { data, error } = await supabase
      .from('assignment_submissions')
      .upsert(
        {
          assignment_id: assignmentId,
          student_id: user.id,
          files: normalized,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id,student_id' }
      )
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (body.action === 'grade') {
    const teacher = await requireTeacher(supabase, id, user.id)
    if (isAclError(teacher)) {
      return NextResponse.json({ error: teacher.error }, { status: teacher.status })
    }
    if (!body.submission_id || body.score == null) {
      return NextResponse.json({ error: 'submission_id and score required' }, { status: 400 })
    }

    const score = Number(body.score)
    if (!Number.isFinite(score)) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
    }

    const { data: assignmentMeta } = await supabase
      .from('assignments')
      .select('max_score')
      .eq('id', assignmentId)
      .eq('classroom_id', id)
      .single()
    const maxScore = Number(assignmentMeta?.max_score ?? 10)
    if (score < 0 || score > maxScore) {
      return NextResponse.json(
        { error: `Score must be between 0 and ${maxScore}` },
        { status: 400 }
      )
    }

    const { data: sub } = await supabase
      .from('assignment_submissions')
      .select('id')
      .eq('id', body.submission_id)
      .eq('assignment_id', assignmentId)
      .single()
    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const { data: grade, error } = await supabase
      .from('grades')
      .upsert(
        {
          submission_id: body.submission_id,
          score,
          comment: body.comment?.trim() || null,
          graded_by: user.id,
          method: body.method ?? 'manual',
          rubric_id: body.rubric_id ?? null,
          ai_suggestion: body.ai_suggestion ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'submission_id' }
      )
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase
      .from('assignment_submissions')
      .update({ status: 'graded', updated_at: new Date().toISOString() })
      .eq('id', body.submission_id)

    return NextResponse.json(grade)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
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

  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', assignmentId)
    .eq('classroom_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
