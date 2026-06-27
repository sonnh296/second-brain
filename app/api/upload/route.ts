export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { streamUpload } from '@/lib/storage'
import { enqueueIngestionJob } from '@/lib/queue'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  checkDocumentQuota,
  sanitizeFilename,
  quotaStatusCode,
} from '@/lib/upload-limits'
import { cleanupFailedUpload } from '@/lib/upload/cleanup-document'
import {
  createValidatedUploadStream,
  MAX_UPLOAD_DESCRIPTION_LENGTH,
} from '@/lib/upload/create-upload-stream'
import { logger } from '@/lib/logger'

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

  let documentId: string | undefined
  let r2Key: string | undefined

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const blob = file as File
    const rawFilename =
      (formData.get('filename') as string) || blob.name || 'unknown'
    const filename = sanitizeFilename(rawFilename)
    const rawDescription = (formData.get('description') as string) || null
    const description =
      rawDescription && rawDescription.trim().length > MAX_UPLOAD_DESCRIPTION_LENGTH
        ? rawDescription.trim().slice(0, MAX_UPLOAD_DESCRIPTION_LENGTH)
        : rawDescription?.trim() || null

    const rawFolderId = (formData.get('folder_id') as string) || null
    let folderId: string | null = null
    if (rawFolderId && rawFolderId !== 'root') {
      const { data: folder } = await supabase
        .from('folders')
        .select('id')
        .eq('id', rawFolderId)
        .eq('user_id', userId)
        .single()
      if (!folder) {
        return NextResponse.json({ error: 'Thư mục không tồn tại' }, { status: 400 })
      }
      folderId = folder.id
    }

    const quota = await checkDocumentQuota(supabase, userId, blob.size)
    if (!quota.ok) {
      return NextResponse.json(
        { error: quota.error.message },
        { status: quotaStatusCode(quota.error) }
      )
    }

    const streamResult = await createValidatedUploadStream(blob, filename)
    if (!streamResult.ok) {
      return NextResponse.json({ error: streamResult.error }, { status: 400 })
    }

    const { stream, fileType, fileSizeBytes } = streamResult.result

    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        filename,
        file_type: fileType,
        r2_key: 'pending',
        description,
        folder_id: folderId,
        file_size_bytes: fileSizeBytes,
        status: 'pending',
      })
      .select('id')
      .single()

    if (docErr || !doc) {
      logger.error('Upload DB insert failed', { err: docErr, userId })
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
    }

    const newDocumentId = doc.id
    documentId = newDocumentId
    const newR2Key = `${userId}/${newDocumentId}/${filename}`
    r2Key = newR2Key

    await supabase.from('documents').update({ r2_key: newR2Key }).eq('id', newDocumentId)

    await streamUpload(newR2Key, stream)

    await enqueueIngestionJob({
      document_id: newDocumentId,
      r2_key: newR2Key,
      file_type: fileType,
      user_id: userId,
    })

    logger.info('Upload queued for ingestion', {
      userId,
      documentId: newDocumentId,
      fileType,
      fileSizeBytes,
    })

    return NextResponse.json({ document_id: newDocumentId, status: 'pending' }, { status: 201 })
  } catch (err) {
    logger.error('Upload failed', { err, userId, documentId })
    if (documentId) {
      await cleanupFailedUpload(supabase, documentId, userId, r2Key)
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
