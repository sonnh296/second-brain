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
import {
  isBrowserInlineType,
  mimeForType,
  typeFromExtension,
} from '@/lib/upload/file-types'

type Ctx = { params: Promise<{ id: string; assignmentId: string }> }

type SubmissionFile = {
  file_id?: string
  r2_key?: string
  filename?: string
  file_type?: string
}

function contentDisposition(filename: string, inline: boolean): string {
  const encoded = encodeURIComponent(filename)
  const mode = inline ? 'inline' : 'attachment'
  return `${mode}; filename="${encoded}"; filename*=UTF-8''${encoded}`
}

/** Parse `bytes=start-end` / `bytes=start-`. Returns null if malformed. */
function parseBytesRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match) return null

  const startRaw = match[1]
  const endRaw = match[2]
  if (!startRaw && !endRaw) return null

  let start: number
  let end: number

  if (!startRaw) {
    const suffix = parseInt(endRaw, 10)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = parseInt(startRaw, 10)
    end = endRaw ? parseInt(endRaw, 10) : size - 1
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  }

  if (start < 0 || end < start || start >= size) return null
  end = Math.min(end, size - 1)
  return { start, end }
}

/**
 * Stream a submission file. Teacher: any student on this assignment.
 * Student: own submission only.
 * Query: file_id (required), student_id (required for teacher when viewing others),
 * download=1 to force attachment.
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
    membership.role === 'teacher' ? requestedStudentId || user.id : user.id

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

  const fileType =
    file.file_type || typeFromExtension(file.filename) || 'file'
  const forceDownload = req.nextUrl.searchParams.get('download') === '1'
  const mime = mimeForType(fileType)
  const inline =
    !forceDownload && (isBrowserInlineType(fileType) || mime.startsWith('text/'))

  const meta = await headObject(file.r2_key)
  if (!meta) return NextResponse.json({ error: 'File missing on storage' }, { status: 404 })

  const size = meta.size ?? 0
  const rangeHeader = req.headers.get('range')
  const range = parseBytesRange(rangeHeader, size)

  if (rangeHeader && size > 0 && !range) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${size}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  const ranged = Boolean(range)
  const { stream, contentType, contentLength, contentRange } = await getObjectStream(
    file.r2_key,
    ranged ? { range: `bytes=${range!.start}-${range!.end}` } : undefined
  )

  const resolvedType = contentType?.startsWith('application/octet')
    ? mime
    : (contentType ?? mime)

  const headers: Record<string, string> = {
    'Content-Type': resolvedType,
    'Content-Disposition': contentDisposition(file.filename, inline),
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  }

  if (ranged && range) {
    headers['Content-Range'] =
      contentRange ?? `bytes ${range.start}-${range.end}/${size}`
    headers['Content-Length'] = String(contentLength ?? range.end - range.start + 1)
  } else if (size > 0 || contentLength) {
    headers['Content-Length'] = String(contentLength ?? size)
  }

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: ranged ? 206 : 200,
    headers,
  })
}
