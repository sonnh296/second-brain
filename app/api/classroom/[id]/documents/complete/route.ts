export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireTeacher, CLASSROOM_DOC_MAX_BYTES } from '@/lib/classroom/acl'
import { headObject, getObjectHeaderBytes, deleteObject } from '@/lib/storage'
import { enqueueIngestionJob, getIngestionQueue, ingestionJobId } from '@/lib/queue'
import { detectAndValidateFileType } from '@/lib/upload/validate-file'
import { logger } from '@/lib/logger'

type Ctx = { params: Promise<{ id: string }> }

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

  let body: { document_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.document_id) {
    return NextResponse.json({ error: 'document_id required' }, { status: 400 })
  }

  const { data: doc } = await supabase
    .from('classroom_documents')
    .select('id, filename, r2_key, file_type, status, chunk_count')
    .eq('id', body.document_id)
    .eq('classroom_id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (doc.status === 'processing') {
    return NextResponse.json({ error: 'Already processing' }, { status: 409 })
  }
  if (doc.status === 'done' && (doc.chunk_count ?? 0) > 0) {
    return NextResponse.json({ error: 'Already processed' }, { status: 400 })
  }

  const head = await headObject(doc.r2_key)
  if (!head) {
    return NextResponse.json({ error: 'Upload missing on storage' }, { status: 400 })
  }
  if (head.size > CLASSROOM_DOC_MAX_BYTES) {
    await deleteObject(doc.r2_key).catch(() => {})
    return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 413 })
  }

  const header = await getObjectHeaderBytes(doc.r2_key)
  const validation = detectAndValidateFileType(doc.filename, header ?? Buffer.alloc(0))
  if (!validation.ok) {
    await deleteObject(doc.r2_key).catch(() => {})
    await supabase
      .from('classroom_documents')
      .update({
        status: 'failed',
        error_message: validation.error ?? 'Invalid file type',
      })
      .eq('id', doc.id)
    return NextResponse.json(
      { error: validation.error ?? 'Invalid file type' },
      { status: 400 }
    )
  }
  const fileType = validation.fileType

  await supabase
    .from('classroom_documents')
    .update({
      file_size_bytes: head.size,
      file_type: fileType,
      status: 'pending',
      chunk_count: null,
      error_message: null,
    })
    .eq('id', doc.id)

  try {
    await enqueueIngestionJob(
      {
        document_id: doc.id,
        r2_key: doc.r2_key,
        file_type: fileType,
        user_id: user.id,
        classroom_id: id,
        product: 'classroom',
      },
      { force: true }
    )
    const queue = getIngestionQueue()
    const job = await queue.getJob(ingestionJobId(doc.id))
    const state = job ? await job.getState() : null
    if (!job || state === 'completed' || state === 'failed') {
      throw new Error(`Job not queued (state=${state ?? 'missing'})`)
    }
  } catch (err) {
    logger.error('Classroom enqueue failed', { err, documentId: doc.id })
    await supabase
      .from('classroom_documents')
      .update({ status: 'failed', error_message: 'Queue error' })
      .eq('id', doc.id)
    return NextResponse.json({ error: 'Could not start processing' }, { status: 500 })
  }

  return NextResponse.json({ document_id: doc.id, status: 'pending' }, { status: 201 })
}
