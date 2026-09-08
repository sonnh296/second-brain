export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember } from '@/lib/classroom/acl'
import {
  isBrowserInlineType,
  isImageType,
  isSpreadsheetType,
  isTranscribableType,
} from '@/lib/upload/file-types'
import { isOcrWeakContentWarning } from '@/lib/ingestion/ocr-status'

type Ctx = { params: Promise<{ id: string; docId: string }> }

function subtitleText(raw: string | null): string | null {
  if (!raw?.trim()) return null
  const text = raw.trim()
  const match = text.match(/^Mô tả:\s*[^\n]*\n\n([\s\S]*)$/)
  return (match ? match[1] : text).trim() || null
}

async function loadChunkText(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  documentId: string
): Promise<string> {
  const { data: chunks } = await supabase
    .from('classroom_document_chunks')
    .select('chunk_text, chunk_index')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
  return (chunks ?? []).map((c) => c.chunk_text).join('\n\n')
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, docId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const { data: doc } = await supabase
    .from('classroom_documents')
    .select(
      'id, filename, file_type, status, error_message, chunk_count, file_size_bytes, created_at'
    )
    .eq('id', docId)
    .eq('classroom_id', id)
    .is('deleted_at', null)
    .single()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const viewerUrl = `/api/classroom/${id}/documents/${docId}`
  const canInline = isBrowserInlineType(doc.file_type)

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

    const storedContent = (await loadChunkText(supabase, docId)).trim() || null
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

  if (isTranscribableType(doc.file_type)) {
    const isVideo = doc.file_type === 'mp4' || doc.file_type === 'mov'
    const raw = (await loadChunkText(supabase, docId)).trim() || null
    const transcript = subtitleText(raw)
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

  if (doc.file_type === 'pdf') {
    if (doc.status !== 'done' && doc.status !== 'failed') {
      return NextResponse.json({
        filename: doc.filename,
        file_type: doc.file_type,
        status: doc.status,
        content: null,
        preview_type: 'unavailable',
        message: 'Tài liệu đang được xử lý...',
        viewer_url: viewerUrl,
        can_inline: true,
      })
    }
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: null,
      preview_type: 'pdf',
      viewer_url: viewerUrl,
      can_inline: true,
    })
  }

  if (isSpreadsheetType(doc.file_type)) {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: null,
      preview_type: 'spreadsheet',
      viewer_url: viewerUrl,
      can_inline: canInline,
    })
  }

  if (doc.status !== 'done' && doc.status !== 'failed') {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: null,
      preview_type: 'unavailable',
      message: 'Tài liệu đang được xử lý...',
    })
  }

  const content = (await loadChunkText(supabase, docId)).trim()
  if (content) {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content,
      preview_type: 'text',
    })
  }

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
