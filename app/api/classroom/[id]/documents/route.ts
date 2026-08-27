export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import {
  CLASSROOM_DOC_MAX_BYTES,
  classroomR2Key,
  isAclError,
  requireMember,
  requireTeacher,
} from '@/lib/classroom/acl'
import { sanitizeFilename } from '@/lib/upload-limits'
import { typeFromExtension, mimeForType } from '@/lib/upload/file-types'
import { presignPutUrl } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
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

  const folderId = req.nextUrl.searchParams.get('folder_id')
  if (!folderId) {
    return NextResponse.json({ error: 'folder_id required' }, { status: 400 })
  }

  const { data: folder } = await supabase
    .from('classroom_folders')
    .select('id')
    .eq('id', folderId)
    .eq('classroom_id', id)
    .maybeSingle()

  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('classroom_documents')
    .select(
      'id, filename, file_type, file_size_bytes, status, chunk_count, error_message, created_at, folder_id, uploaded_by'
    )
    .eq('classroom_id', id)
    .eq('folder_id', folderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [], role: membership.role })
}

/** Presign classroom material upload (teacher only). */
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

  const rl = await checkRateLimit(user.id, 'classroom-upload', 20, 3600, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many uploads' }, { status: 429 })
  }

  let body: { filename?: string; size?: number; folder_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const size = Number(body.size)
  if (!body.filename || !body.folder_id || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'filename, size, folder_id required' }, { status: 400 })
  }
  if (size > CLASSROOM_DOC_MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 413 })
  }

  const { data: folder } = await supabase
    .from('classroom_folders')
    .select('id')
    .eq('id', body.folder_id)
    .eq('classroom_id', id)
    .maybeSingle()
  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 400 })

  const filename = sanitizeFilename(body.filename)
  const fileType = typeFromExtension(filename) ?? 'file'

  const { data: doc, error } = await supabase
    .from('classroom_documents')
    .insert({
      classroom_id: id,
      folder_id: body.folder_id,
      uploaded_by: user.id,
      filename,
      file_type: fileType,
      r2_key: 'pending',
      file_size_bytes: size,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  const r2Key = classroomR2Key(id, doc.id, filename)
  await supabase.from('classroom_documents').update({ r2_key: r2Key }).eq('id', doc.id)

  const uploadUrl = await presignPutUrl(r2Key, mimeForType(fileType))
  return NextResponse.json(
    { document_id: doc.id, upload_url: uploadUrl, content_type: mimeForType(fileType) },
    { status: 201 }
  )
}
