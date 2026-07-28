export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { presignPutUrl } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  checkDocumentQuota,
  sanitizeFilename,
  quotaStatusCode,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/upload-limits'
import { MAX_UPLOAD_DESCRIPTION_LENGTH } from '@/lib/upload/create-upload-stream'
import { typeFromExtension, mimeForType } from '@/lib/upload/file-types'
import { logger } from '@/lib/logger'

/**
 * Step 1 of direct-to-R2 upload: validate + create the document record,
 * return a presigned PUT URL. The browser uploads straight to R2, then
 * calls /api/upload/complete.
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

  const rl = await checkRateLimit(userId, 'upload', 10, 3600, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please wait before uploading again.' },
      { status: 429 }
    )
  }

  let body: { filename?: string; size?: number; description?: string; folder_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const size = Number(body.size)
  if (!body.filename || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'filename và size là bắt buộc' }, { status: 400 })
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

  const description = body.description?.trim()
    ? body.description.trim().slice(0, MAX_UPLOAD_DESCRIPTION_LENGTH)
    : null

  let folderId: string | null = null
  if (body.folder_id && body.folder_id !== 'root') {
    const { data: folder } = await supabase
      .from('folders')
      .select('id')
      .eq('id', body.folder_id)
      .eq('user_id', userId)
      .single()
    if (!folder) {
      return NextResponse.json({ error: 'Thư mục không tồn tại' }, { status: 400 })
    }
    folderId = folder.id
  }

  const quota = await checkDocumentQuota(supabase, userId, size)
  if (!quota.ok) {
    return NextResponse.json(
      { error: quota.error.message },
      { status: quotaStatusCode(quota.error) }
    )
  }

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      filename,
      file_type: fileType,
      r2_key: 'pending',
      description,
      folder_id: folderId,
      file_size_bytes: size,
      status: 'pending',
    })
    .select('id')
    .single()

  if (docErr || !doc) {
    logger.error('Presign DB insert failed', { err: docErr, userId })
    return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
  }

  const r2Key = `${userId}/${doc.id}/${filename}`
  await supabase.from('documents').update({ r2_key: r2Key }).eq('id', doc.id)

  const contentType = mimeForType(fileType)
  const uploadUrl = await presignPutUrl(r2Key, contentType)

  logger.info('Presigned upload created', { userId, documentId: doc.id, fileType, size })

  return NextResponse.json(
    {
      document_id: doc.id,
      upload_url: uploadUrl,
      content_type: contentType,
    },
    { status: 201 }
  )
}
