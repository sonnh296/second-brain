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
  const { stream, contentType, contentLength } = await getObjectStream(doc.r2_key)
  const resolvedType = contentType?.startsWith('application/octet')
    ? mime
    : (contentType ?? mime)

  const encoded = encodeURIComponent(doc.filename)
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': resolvedType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff',
      ...(meta?.size || contentLength
        ? { 'Content-Length': String(contentLength ?? meta?.size) }
        : {}),
    },
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
