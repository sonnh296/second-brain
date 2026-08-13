import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import {
  isBrowserInlineType,
  isImageType,
  isTranscribableType,
} from '@/lib/upload/file-types'
import { isOcrWeakContentWarning } from '@/lib/ingestion/ocr-status'

/** Strip legacy "Mô tả: ..." prefix so the UI shows only the subtitle text. */
function subtitleText(raw: string | null): string | null {
  if (!raw?.trim()) return null
  const text = raw.trim()
  const match = text.match(/^Mô tả:\s*[^\n]*\n\n([\s\S]*)$/)
  return (match ? match[1] : text).trim() || null
}

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
    .select(
      'id, filename, file_type, status, note_content, extracted_content, ocr_text, error_message'
    )
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

    let message: string | undefined
    if (doc.status === 'failed') {
      message = 'Xử lý ảnh thất bại'
    } else if (isOcrWeakContentWarning(doc.error_message)) {
      message = 'OCR gần như không đọc được chữ — ảnh vẫn dùng bình thường'
    } else if (!storedContent) {
      message = 'Ảnh chưa có văn bản trích xuất'
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
      message,
    })
  }

  // Video / audio: play immediately; subtitles are generated automatically in the background.
  if (isTranscribableType(doc.file_type)) {
    const isVideo = doc.file_type === 'mp4' || doc.file_type === 'mov'
    const transcript = subtitleText(storedContent)
    const processing = doc.status !== 'done' && doc.status !== 'failed'

    let message: string | undefined
    if (processing) {
      message = 'Đang tự động tạo phụ đề...'
    } else if (doc.status === 'failed') {
      message = 'Tạo phụ đề thất bại'
    } else if (!transcript) {
      message = 'Không có lời thoại để tạo phụ đề'
    }

    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: transcript,
      preview_type: isVideo ? 'video' : 'audio',
      viewer_url: viewerUrl,
      can_inline: true,
      message,
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
      message: 'Tài liệu đang được xử lý...',
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
