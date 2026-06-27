import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isBrowserInlineType, isImageType } from '@/lib/upload/file-types'

export async function GET(
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

  const { id } = await params

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, file_type, status, note_content, extracted_content, ocr_text')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const storedContent = doc.extracted_content?.trim() || doc.ocr_text?.trim() || null

  const viewerUrl = `/api/documents/${id}/download`
  const canInline = isBrowserInlineType(doc.file_type)

  if (doc.file_type === 'note') {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: doc.note_content ?? storedContent ?? '',
      preview_type: 'text',
    })
  }

  if (isImageType(doc.file_type)) {
    if (doc.status !== 'done' && doc.status !== 'failed') {
      return NextResponse.json({
        filename: doc.filename,
        file_type: doc.file_type,
        status: doc.status,
        content: null,
        preview_type: 'image',
        image_url: viewerUrl,
        viewer_url: viewerUrl,
        can_inline: true,
        message: 'Đang OCR và xử lý ảnh...',
      })
    }

    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: storedContent,
      preview_type: storedContent ? 'image_with_text' : 'image',
      image_url: viewerUrl,
      viewer_url: viewerUrl,
      can_inline: true,
      message: storedContent ? undefined : 'Ảnh chưa có văn bản trích xuất',
    })
  }

  if (doc.file_type === 'pdf' && doc.status === 'done') {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: storedContent,
      preview_type: 'pdf',
      viewer_url: viewerUrl,
      can_inline: true,
    })
  }

  if (doc.status !== 'done') {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: storedContent,
      preview_type: 'unavailable',
      message: 'Document is still processing or failed',
    })
  }

  if (storedContent) {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: storedContent,
      preview_type: 'text',
    })
  }

  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('chunk_text, chunk_index')
    .eq('document_id', id)
    .order('chunk_index', { ascending: true })

  const content = (chunks ?? []).map((c) => c.chunk_text).join('\n\n')

  if (!content.trim()) {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: null,
      preview_type: 'binary',
      message: 'Trình duyệt không xem trực tiếp loại file này — dùng nút Tải về',
      download_url: `${viewerUrl}?download=1`,
      viewer_url: viewerUrl,
      can_inline: canInline,
    })
  }

  return NextResponse.json({
    filename: doc.filename,
    file_type: doc.file_type,
    status: doc.status,
    content,
    preview_type: 'text',
  })
}
