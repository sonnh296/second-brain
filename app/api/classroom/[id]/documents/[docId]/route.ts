export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember, requireTeacher } from '@/lib/classroom/acl'
import { getObjectStream, deleteObject, headObject } from '@/lib/storage'
import { deleteByClassroomDocument } from '@/lib/vector'
import { isBrowserInlineType, mimeForType } from '@/lib/upload/file-types'

type Ctx = { params: Promise<{ id: string; docId: string }> }

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

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, docId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const { data: doc } = await supabase
    .from('classroom_documents')
    .select('filename, file_type, r2_key')
    .eq('id', docId)
    .eq('classroom_id', id)
    .is('deleted_at', null)
    .single()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const forceDownload = req.nextUrl.searchParams.get('download') === '1'
  const mime = mimeForType(doc.file_type)
  const inline =
    !forceDownload && (isBrowserInlineType(doc.file_type) || mime.startsWith('text/'))

  const meta = await headObject(doc.r2_key)
  const size = meta?.size ?? 0
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
    doc.r2_key,
    ranged ? { range: `bytes=${range!.start}-${range!.end}` } : undefined
  )

  const resolvedType = contentType?.startsWith('application/octet')
    ? mime
    : (contentType ?? mime)

  const headers: Record<string, string> = {
    'Content-Type': resolvedType,
    'Content-Disposition': contentDisposition(doc.filename, inline),
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

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id, docId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const { data: doc } = await supabase
    .from('classroom_documents')
    .select('id, r2_key')
    .eq('id', docId)
    .eq('classroom_id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase
    .from('classroom_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', docId)

  await deleteByClassroomDocument(id, docId).catch(() => {})
  await deleteObject(doc.r2_key).catch(() => {})
  await supabase.from('classroom_document_chunks').delete().eq('document_id', docId)

  return NextResponse.json({ ok: true })
}
