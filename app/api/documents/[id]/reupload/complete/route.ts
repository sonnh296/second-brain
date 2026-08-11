export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import {
  deleteObject,
  getObjectHeaderBytes,
  headObject,
} from '@/lib/storage'
import {
  enqueueIngestionJob,
  getIngestionQueue,
  ingestionJobId,
} from '@/lib/queue'
import {
  canReplaceWithinStorageLimit,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/upload-limits'
import { detectAndValidateFileType } from '@/lib/upload/validate-file'
import { deleteByDocument, ensureCollection } from '@/lib/vector'
import { logger } from '@/lib/logger'

async function clearReplacement(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  documentId: string,
  userId: string
) {
  await supabase
    .from('documents')
    .update({
      replacement_r2_key: null,
      replacement_filename: null,
      replacement_file_type: null,
      replacement_size_bytes: null,
      replacement_started_at: null,
    })
    .eq('id', documentId)
    .eq('user_id', userId)
}

async function removeInactiveIngestionJob(
  documentId: string
): Promise<boolean> {
  const job = await getIngestionQueue().getJob(ingestionJobId(documentId))
  if (!job) return true
  if ((await job.getState()) === 'active') return false
  await job.remove()
  return true
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id
  const { id: documentId } = await params
  const { data: doc } = await supabase
    .from('documents')
    .select(
      'id, status, r2_key, file_size_bytes, replacement_r2_key, replacement_filename, replacement_size_bytes'
    )
    .eq('id', documentId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  if (doc.status !== 'failed') {
    return NextResponse.json(
      { error: 'Tài liệu không còn ở trạng thái lỗi' },
      { status: 409 }
    )
  }

  const replacementKey = doc.replacement_r2_key as string | null
  const replacementFilename = doc.replacement_filename as string | null
  const replacementSize = Number(doc.replacement_size_bytes)
  if (
    !replacementKey ||
    !replacementFilename ||
    !Number.isFinite(replacementSize) ||
    replacementSize <= 0
  ) {
    return NextResponse.json(
      { error: 'Không có file tải lại đang chờ hoàn tất' },
      { status: 400 }
    )
  }

  const queueReady = await removeInactiveIngestionJob(documentId).catch(
    () => false
  )
  if (!queueReady) {
    return NextResponse.json(
      { error: 'Tài liệu vẫn đang được worker xử lý, vui lòng thử lại sau' },
      { status: 409 }
    )
  }

  const head = await headObject(replacementKey)
  if (!head) {
    return NextResponse.json(
      { error: 'Chưa nhận được file tải lại — vui lòng thử lại' },
      { status: 400 }
    )
  }
  if (head.size > MAX_FILE_SIZE_BYTES) {
    await deleteObject(replacementKey).catch(() => {})
    await clearReplacement(supabase, documentId, userId)
    return NextResponse.json({ error: 'File quá lớn' }, { status: 413 })
  }

  const header = await getObjectHeaderBytes(replacementKey)
  const validation = detectAndValidateFileType(replacementFilename, header)
  if (!validation.ok) {
    await deleteObject(replacementKey).catch(() => {})
    await clearReplacement(supabase, documentId, userId)
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { data: storageRows, error: storageError } = await supabase
    .from('documents')
    .select('file_size_bytes')
    .eq('user_id', userId)
  if (storageError) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  const usedBytes = (storageRows ?? []).reduce(
    (sum, row) => sum + (row.file_size_bytes ?? 0),
    0
  )
  if (
    !canReplaceWithinStorageLimit(
      usedBytes,
      doc.file_size_bytes ?? 0,
      head.size
    )
  ) {
    await deleteObject(replacementKey).catch(() => {})
    await clearReplacement(supabase, documentId, userId)
    return NextResponse.json(
      {
        error: `Storage limit reached (max ${process.env.MAX_STORAGE_MB_PER_USER ?? 10240} MB per user)`,
      },
      { status: 403 }
    )
  }

  try {
    await ensureCollection()
    await deleteByDocument(userId, documentId)
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
    if (chunksError) throw chunksError
  } catch (error) {
    logger.error('Failed to clear stale index before document replacement', {
      err: error,
      userId,
      documentId,
    })
    return NextResponse.json(
      { error: 'Không thể dọn dữ liệu xử lý cũ' },
      { status: 500 }
    )
  }

  const oldR2Key = doc.r2_key as string
  const { data: switched, error: switchError } = await supabase
    .from('documents')
    .update({
      filename: replacementFilename,
      file_type: validation.fileType,
      r2_key: replacementKey,
      file_size_bytes: head.size,
      status: 'pending',
      error_message: null,
      chunk_count: null,
      content_hash: null,
      extracted_content: null,
      ocr_text: null,
      replacement_r2_key: null,
      replacement_filename: null,
      replacement_file_type: null,
      replacement_size_bytes: null,
      replacement_started_at: null,
    })
    .eq('id', documentId)
    .eq('user_id', userId)
    .eq('status', 'failed')
    .eq('replacement_r2_key', replacementKey)
    .select('id')
    .maybeSingle()
  if (switchError || !switched) {
    return NextResponse.json(
      { error: 'File tải lại đã được thay đổi bởi một yêu cầu khác' },
      { status: 409 }
    )
  }

  try {
    await enqueueIngestionJob({
      document_id: documentId,
      r2_key: replacementKey,
      file_type: validation.fileType,
      user_id: userId,
    })
  } catch (error) {
    logger.error('Failed to enqueue replaced document', {
      err: error,
      userId,
      documentId,
    })
    await supabase
      .from('documents')
      .update({
        status: 'failed',
        error_message: 'Không thể xếp hàng xử lý file tải lại',
      })
      .eq('id', documentId)
    return NextResponse.json(
      { error: 'Không thể bắt đầu xử lý file tải lại' },
      { status: 500 }
    )
  }

  if (oldR2Key && oldR2Key !== 'pending' && oldR2Key !== replacementKey) {
    await deleteObject(oldR2Key).catch((error) => {
      logger.warn('Failed to delete old object after document replacement', {
        err: error,
        userId,
        documentId,
      })
    })
  }

  return NextResponse.json(
    { document_id: documentId, status: 'pending' },
    { status: 201 }
  )
}
