export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { deleteObject, presignPutUrl } from '@/lib/storage'
import {
  canReplaceWithinStorageLimit,
  MAX_FILE_SIZE_BYTES,
  sanitizeFilename,
} from '@/lib/upload-limits'
import { mimeForType, typeFromExtension } from '@/lib/upload/file-types'
import { getIngestionQueue, ingestionJobId } from '@/lib/queue'
import { logger } from '@/lib/logger'

async function removeInactiveIngestionJob(
  documentId: string
): Promise<{ ok: true } | { ok: false }> {
  const job = await getIngestionQueue().getJob(ingestionJobId(documentId))
  if (!job) return { ok: true }
  if ((await job.getState()) === 'active') return { ok: false }
  await job.remove()
  return { ok: true }
}

export async function POST(
  req: NextRequest,
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
  const rateLimit = await checkRateLimit(userId, 'upload', 10, 3600, {
    failClosed: true,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please wait before uploading again.' },
      { status: 429 }
    )
  }

  const body = (await req.json().catch(() => null)) as
    | { filename?: string; size?: number }
    | null
  const size = Number(body?.size)
  if (!body?.filename || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: 'filename và size là bắt buộc' },
      { status: 400 }
    )
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${process.env.MAX_FILE_SIZE_MB ?? 1024} MB)` },
      { status: 413 }
    )
  }

  const filename = sanitizeFilename(body.filename)
  const fileType = typeFromExtension(filename)
  if (!fileType) {
    return NextResponse.json(
      { error: 'Loại file không được phép tải lên' },
      { status: 400 }
    )
  }

  const { data: doc } = await supabase
    .from('documents')
    .select(
      'id, status, file_type, file_size_bytes, replacement_r2_key'
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
      { error: 'Chỉ có thể tải lại tài liệu đang lỗi' },
      { status: 409 }
    )
  }
  if (doc.file_type === 'note') {
    return NextResponse.json(
      { error: 'Ghi chú không hỗ trợ tải lại file' },
      { status: 400 }
    )
  }

  const queueReady = await removeInactiveIngestionJob(documentId).catch(() => ({
    ok: false as const,
  }))
  if (!queueReady.ok) {
    return NextResponse.json(
      { error: 'Tài liệu vẫn đang được worker xử lý, vui lòng thử lại sau' },
      { status: 409 }
    )
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
      size
    )
  ) {
    return NextResponse.json(
      {
        error: `Storage limit reached (max ${process.env.MAX_STORAGE_MB_PER_USER ?? 10240} MB per user)`,
      },
      { status: 403 }
    )
  }

  const replacementKey = `${userId}/${documentId}/replacements/${randomUUID()}/${filename}`
  const contentType = mimeForType(fileType)
  const uploadUrl = await presignPutUrl(replacementKey, contentType)
  const previousReplacementKey = doc.replacement_r2_key as string | null

  const { data: staged, error: updateError } = await supabase
    .from('documents')
    .update({
      replacement_r2_key: replacementKey,
      replacement_filename: filename,
      replacement_file_type: fileType,
      replacement_size_bytes: size,
      replacement_started_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', userId)
    .eq('status', 'failed')
    .select('id')
    .maybeSingle()
  if (updateError || !staged) {
    logger.error('Failed to stage document replacement', {
      err: updateError,
      userId,
      documentId,
    })
    return NextResponse.json(
      { error: 'Không thể chuẩn bị tải lại tài liệu' },
      { status: 500 }
    )
  }

  if (
    previousReplacementKey &&
    previousReplacementKey !== replacementKey
  ) {
    await deleteObject(previousReplacementKey).catch(() => {})
  }

  return NextResponse.json({
    document_id: documentId,
    upload_url: uploadUrl,
    content_type: contentType,
  })
}
