import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { flattenDocumentTags, fetchTagsForDocument, syncDocumentTags } from '@/lib/db/document-tags'
import { updateDocumentFilename } from '@/lib/vector'
import { enqueueIngestionJob } from '@/lib/queue'
import { softDeleteDocument } from '@/lib/documents/soft-delete'
import { hardDeleteDocument } from '@/lib/documents/hard-delete'
import { isOcrWeakContentWarning } from '@/lib/ingestion/ocr-status'
import { logger } from '@/lib/logger'

const DOCUMENT_SELECT = `
  id, user_id, filename, file_type, r2_key, status, error_message, file_size_bytes, chunk_count,
  description, note_content, folder_id, deleted_at, is_favorite, created_at,
  document_tags (
    tags (id, name, color)
  )
`

export async function GET(
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

  const { id: documentId } = await params

  const { data: doc, error } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('id', documentId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { document_tags, ...rest } = doc as typeof doc & {
    document_tags?: Parameters<typeof flattenDocumentTags>[0]
  }

  return NextResponse.json({
    ...rest,
    is_favorite: Boolean(rest.is_favorite),
    tags: flattenDocumentTags(document_tags),
  })
}

const UpdateDocumentSchema = z.object({
  filename: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  note_content: z.string().min(1).max(50000).optional(),
  content: z.string().max(200000).optional(),
  tag_ids: z.array(z.string().uuid()).max(20).optional(),
  folder_id: z.string().uuid().nullable().optional(),
  is_favorite: z.boolean().optional(),
  /** Clear soft OCR warning after user chooses to keep the image. */
  dismiss_ocr_warning: z.boolean().optional(),
})

export async function PATCH(
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

  const { id: documentId } = await params
  const body = await req.json().catch(() => null)
  const parsed = UpdateDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, file_type, r2_key, filename, error_message')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.filename !== undefined) updates.filename = parsed.data.filename
  if (parsed.data.description !== undefined) updates.description = parsed.data.description
  if (parsed.data.is_favorite !== undefined) updates.is_favorite = parsed.data.is_favorite

  if (parsed.data.dismiss_ocr_warning) {
    if (!isOcrWeakContentWarning(doc.error_message)) {
      return NextResponse.json({ error: 'Không có cảnh báo OCR để bỏ' }, { status: 400 })
    }
    updates.error_message = null
  }
  if (parsed.data.folder_id !== undefined) {
    if (parsed.data.folder_id) {
      const { data: folder } = await supabase
        .from('folders')
        .select('id')
        .eq('id', parsed.data.folder_id)
        .eq('user_id', user.id)
        .single()
      if (!folder) {
        return NextResponse.json({ error: 'Thư mục không tồn tại' }, { status: 400 })
      }
    }
    updates.folder_id = parsed.data.folder_id
  }

  let shouldReingest = false
  let manualContent: string | null = null
  if (parsed.data.note_content !== undefined) {
    if (doc.file_type !== 'note') {
      return NextResponse.json({ error: 'Only notes can be edited' }, { status: 400 })
    }
    updates.note_content = parsed.data.note_content
    updates.file_size_bytes = Buffer.byteLength(parsed.data.note_content, 'utf8')
    updates.status = 'pending'
    updates.chunk_count = null
    updates.error_message = null
    shouldReingest = true
  }

  if (parsed.data.content !== undefined) {
    if (doc.file_type === 'note') {
      return NextResponse.json({ error: 'Use note editor for notes' }, { status: 400 })
    }
    const normalized = parsed.data.content.trim()
    if (!normalized) {
      return NextResponse.json({ error: 'Nội dung không được để trống' }, { status: 400 })
    }
    manualContent = normalized
  }

  if (Object.keys(updates).length === 0 && parsed.data.tag_ids === undefined) {
    if (manualContent === null) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }
  }

  let updated = doc as Record<string, unknown>

  if (Object.keys(updates).length > 0) {
    const { data: updatedRow, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', documentId)
      .select(
        'id, filename, file_type, status, description, note_content, file_size_bytes, chunk_count, error_message, folder_id, extracted_content, ocr_text, is_favorite, created_at'
      )
      .single()

    if (error || !updatedRow) {
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }
    updated = updatedRow
  } else {
    const { data: existing } = await supabase
      .from('documents')
      .select(
        'id, filename, file_type, status, description, note_content, file_size_bytes, chunk_count, error_message, folder_id, extracted_content, ocr_text, is_favorite, created_at'
      )
      .eq('id', documentId)
      .single()
    if (existing) updated = existing
  }

  if (parsed.data.filename && parsed.data.filename !== doc.filename) {
    try {
      await updateDocumentFilename(user.id, documentId, parsed.data.filename)
    } catch (err) {
      logger.error('Qdrant filename update failed', { err, documentId, userId: user.id })
    }
  }

  if (manualContent !== null) {
    const contentUpdates = {
      extracted_content: manualContent,
      status: 'pending',
      chunk_count: null,
      error_message: null,
    }
    const { data: refreshed, error: contentError } = await supabase
      .from('documents')
      .update(contentUpdates)
      .eq('id', documentId)
      .eq('user_id', user.id)
      .select(
        'id, filename, file_type, status, description, note_content, file_size_bytes, chunk_count, error_message, folder_id, extracted_content, ocr_text, is_favorite, created_at'
      )
      .single()
    if (contentError || !refreshed) {
      return NextResponse.json({ error: 'Không thể lưu nội dung đã chỉnh sửa' }, { status: 500 })
    }
    updated = refreshed
    try {
      await enqueueIngestionJob(
        {
          document_id: documentId,
          r2_key: doc.r2_key,
          file_type: doc.file_type,
          user_id: user.id,
          manual_content: manualContent,
        },
        { force: true }
      )
    } catch (err) {
      await supabase
        .from('documents')
        .update({ status: 'failed', error_message: 'Không thể xếp hàng cập nhật nội dung' })
        .eq('id', documentId)
        .eq('user_id', user.id)
      logger.error('Manual document reindex enqueue failed', {
        err,
        documentId,
        userId: user.id,
      })
      return NextResponse.json({ error: 'Không thể xếp hàng cập nhật nội dung' }, { status: 500 })
    }
  }

  if (shouldReingest) {
    await enqueueIngestionJob({
      document_id: documentId,
      r2_key: doc.r2_key,
      file_type: 'note',
      user_id: user.id,
    })
  }

  if (parsed.data.tag_ids !== undefined) {
    const tagResult = await syncDocumentTags(
      supabase,
      user.id,
      documentId,
      parsed.data.tag_ids
    )
    if (!tagResult.ok) {
      return NextResponse.json({ error: tagResult.error }, { status: 400 })
    }
  }

  const tags = await fetchTagsForDocument(supabase, documentId)

  return NextResponse.json({ ...updated, tags })
}

/**
 * DELETE — soft-delete (move to trash) by default.
 * DELETE ?permanent=1 — hard-delete; only allowed for items already in trash.
 */
export async function DELETE(
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

  const { id: documentId } = await params
  const permanent = req.nextUrl.searchParams.get('permanent') === '1'

  if (!permanent) {
    const result = await softDeleteDocument(supabase, user.id, documentId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true, trashed: true })
  }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, r2_key, deleted_at')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!doc.deleted_at) {
    return NextResponse.json(
      { error: 'Move to trash first, or omit permanent=1' },
      { status: 400 }
    )
  }

  const result = await hardDeleteDocument(supabase, user.id, {
    id: doc.id,
    r2_key: doc.r2_key,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, failed_steps: result.failed_steps },
      { status: result.status }
    )
  }

  return NextResponse.json({
    success: true,
    permanent: true,
    cleanup_queued: result.cleanup_queued,
    failed_steps: result.failed_steps,
  })
}
