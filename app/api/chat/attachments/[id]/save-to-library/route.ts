import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { copyObject } from '@/lib/storage'
import { enqueueIngestionJob } from '@/lib/queue'
import { checkDocumentQuota, quotaStatusCode } from '@/lib/upload-limits'
import { cleanupFailedUpload } from '@/lib/upload/cleanup-document'
import { logger } from '@/lib/logger'

const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/**
 * Copy a chat image attachment into the knowledge base as a document.
 * The image goes through the normal ingestion pipeline (OCR if enabled),
 * making it searchable and citable like any uploaded file.
 */
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

  const { id } = await params

  const { data: attachment } = await supabase
    .from('message_attachments')
    .select('id, filename, media_type, r2_key, byte_size')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const fileType = MEDIA_EXT[attachment.media_type]
  if (!fileType) {
    return NextResponse.json({ error: 'Loại ảnh không hỗ trợ' }, { status: 400 })
  }

  const quota = await checkDocumentQuota(supabase, userId, attachment.byte_size)
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error.message }, { status: quotaStatusCode(quota.error) })
  }

  const filename = attachment.filename.includes('.')
    ? attachment.filename
    : `${attachment.filename}.${fileType}`

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      filename,
      file_type: fileType,
      r2_key: 'pending',
      file_size_bytes: attachment.byte_size,
      status: 'pending',
      description: 'Lưu từ ảnh chat',
    })
    .select('id')
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Không tạo được tài liệu' }, { status: 500 })
  }

  const r2Key = `${userId}/${doc.id}/${filename}`

  try {
    // Copy so the library document survives chat session deletion
    await copyObject(attachment.r2_key, r2Key)
    await supabase.from('documents').update({ r2_key: r2Key }).eq('id', doc.id)

    await enqueueIngestionJob({
      document_id: doc.id,
      r2_key: r2Key,
      file_type: fileType,
      user_id: userId,
    })
  } catch (err) {
    logger.error('Save chat image to library failed', { err, userId, attachmentId: id })
    await cleanupFailedUpload(supabase, doc.id, userId, r2Key)
    return NextResponse.json({ error: 'Không lưu được vào kho' }, { status: 500 })
  }

  return NextResponse.json({ success: true, document_id: doc.id, filename }, { status: 201 })
}
