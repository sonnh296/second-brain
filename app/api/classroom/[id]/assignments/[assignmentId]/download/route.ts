export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createServerSupabaseClient } from '@/lib/db/server'
import {
  isAclError,
  isOwnedSubmissionR2Key,
  requireMember,
} from '@/lib/classroom/acl'
import { getObjectStream, headObject } from '@/lib/storage'
import { mimeForType } from '@/lib/upload/file-types'

type Ctx = { params: Promise<{ id: string; assignmentId: string }> }

type SubmissionFile = {
  file_id?: string
  r2_key?: string
  filename?: string
  file_type?: string
}

/**
 * Download a submission file. Teacher: any student on this assignment.
 * Student: own submission only.
 * Query: file_id (required), student_id (required for teacher when viewing others).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
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

  const fileId = req.nextUrl.searchParams.get('file_id')?.trim()
  if (!fileId) {
    return NextResponse.json({ error: 'file_id required' }, { status: 400 })
  }

  const requestedStudentId = req.nextUrl.searchParams.get('student_id')?.trim()
  const studentId =
    membership.role === 'teacher'
      ? requestedStudentId || user.id
      : user.id

  if (membership.role === 'teacher' && !requestedStudentId) {
    return NextResponse.json({ error: 'student_id required' }, { status: 400 })
  }
  if (membership.role === 'student' && requestedStudentId && requestedStudentId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id')
    .eq('id', assignmentId)
    .eq('classroom_id', id)
    .single()
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: submission } = await supabase
    .from('assignment_submissions')
    .select('id, student_id, files')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const files = (submission.files as SubmissionFile[]) ?? []
  const file = files.find((f) => f.file_id === fileId)
  if (!file?.r2_key || !file.filename) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  if (!isOwnedSubmissionR2Key(file.r2_key, id, assignmentId, studentId, fileId)) {
    return NextResponse.json({ error: 'Invalid file key' }, { status: 400 })
  }

  const meta = await headObject(file.r2_key)
  if (!meta) return NextResponse.json({ error: 'File missing on storage' }, { status: 404 })

  const mime = mimeForType(file.file_type ?? 'file')
  const { stream, contentType, contentLength } = await getObjectStream(file.r2_key)
  const resolvedType = contentType?.startsWith('application/octet')
    ? mime
    : (contentType ?? mime)

  const encoded = encodeURIComponent(file.filename)
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': resolvedType,
      'Content-Disposition': `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff',
      ...(meta.size || contentLength
        ? { 'Content-Length': String(contentLength ?? meta.size) }
        : {}),
    },
  })
}
