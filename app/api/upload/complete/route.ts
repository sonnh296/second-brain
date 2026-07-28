export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { headObject, getObjectHeaderBytes, deleteObject } from '@/lib/storage'
import { enqueueIngestionJob } from '@/lib/queue'
import { MAX_FILE_SIZE_BYTES } from '@/lib/upload-limits'
import { detectAndValidateFileType } from '@/lib/upload/validate-file'
import { logger } from '@/lib/logger'

/**
 * Step 2 of direct-to-R2 upload: the browser finished its PUT to R2.
 * Verify the object (exists, size, magic bytes), then enqueue ingestion.
 * For video/audio, the worker transcribes once and saves the transcript to DB.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id

  let body: { document_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.document_id) {
    return NextResponse.json({ error: 'document_id là bắt buộc' }, { status: 400 })
  }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, file_type, r2_key, status, chunk_count')
    .eq('id', body.document_id)
    .eq('user_id', userId)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Only block if already actively processed or finished with content.
  // Allow pending (first complete) and failed (retry). chunk_count === 0 used to
  // incorrectly block retries after a storage-only mark.
  if (doc.status === 'processing') {
    return NextResponse.json({ error: 'Tài liệu đang được xử lý' }, { status: 409 })
  }
  if (doc.status === 'done' && (doc.chunk_count ?? 0) > 0) {
    return NextResponse.json({ error: 'Tài liệu đã được xử lý' }, { status: 400 })
  }

  const head = await headObject(doc.r2_key)
  if (!head) {
    return NextResponse.json(
      { error: 'Chưa nhận được file trên kho lưu trữ — hãy thử tải lên lại' },
      { status: 400 }
    )
  }

  if (head.size > MAX_FILE_SIZE_BYTES) {
    await deleteObject(doc.r2_key).catch(() => {})
    await supabase
      .from('documents')
      .update({
        status: 'failed',
        error_message: `File vượt quá dung lượng cho phép (${process.env.MAX_FILE_SIZE_MB ?? 1024} MB)`,
      })
      .eq('id', doc.id)
    return NextResponse.json({ error: 'File quá lớn' }, { status: 413 })
  }

  const header = await getObjectHeaderBytes(doc.r2_key)
  const validation = detectAndValidateFileType(doc.filename, header)
  if (!validation.ok) {
    await deleteObject(doc.r2_key).catch(() => {})
    await supabase
      .from('documents')
      .update({ status: 'failed', error_message: validation.error })
      .eq('id', doc.id)
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  await supabase
    .from('documents')
    .update({
      file_size_bytes: head.size,
      file_type: validation.fileType,
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
        file_type: validation.fileType,
        user_id: userId,
      },
      { force: true }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Không xếp hàng xử lý được'
    logger.error('Failed to enqueue ingestion after direct upload', {
      err,
      userId,
      documentId: doc.id,
    })
    await supabase
      .from('documents')
      .update({ status: 'failed', error_message: `Queue error: ${message}` })
      .eq('id', doc.id)
    return NextResponse.json({ error: 'Không thể bắt đầu xử lý file' }, { status: 500 })
  }

  logger.info('Direct upload completed, queued for ingestion', {
    userId,
    documentId: doc.id,
    fileType: validation.fileType,
    fileSizeBytes: head.size,
  })

  return NextResponse.json({ document_id: doc.id, status: 'pending' }, { status: 201 })
}
