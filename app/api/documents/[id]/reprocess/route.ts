import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { enqueueIngestionJob } from '@/lib/queue'
import { isImageType, isTranscribableType } from '@/lib/upload/file-types'
import { isOcrEnabled } from '@/lib/ingestion/ocr'
import { isTranscriptionEnabled } from '@/lib/ingestion/transcribe'

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

  const { id } = await params

  const { data: doc } = await supabase
    .from('documents')
    .select('id, file_type, r2_key, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const isImage = isImageType(doc.file_type)
  const isMedia = isTranscribableType(doc.file_type)

  if (isImage && !isOcrEnabled()) {
    return NextResponse.json({ error: 'OCR chưa được bật (OCR_ENABLED=true)' }, { status: 400 })
  }
  if (isMedia && !isTranscriptionEnabled()) {
    return NextResponse.json(
      { error: 'Chuyển giọng nói thành văn bản chưa được bật' },
      { status: 400 }
    )
  }
  if (!isImage && !isMedia) {
    return NextResponse.json({ error: 'Chỉ hỗ trợ quét lại ảnh hoặc video/âm thanh' }, { status: 400 })
  }

  await supabase
    .from('documents')
    .update({
      status: 'pending',
      chunk_count: null,
      error_message: null,
      extracted_content: null,
      ocr_text: null,
      content_hash: null,
    })
    .eq('id', id)

  await enqueueIngestionJob(
    {
      document_id: doc.id,
      r2_key: doc.r2_key,
      file_type: doc.file_type,
      user_id: user.id,
    },
    { force: true }
  )

  return NextResponse.json({ success: true, status: 'pending' })
}
