import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { enqueueIngestionJob } from '@/lib/queue'
import { updateDocumentFilename } from '@/lib/vector'
import { softDeleteDocument } from '@/lib/documents/soft-delete'
import { checkRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

type ActionRow = {
  id: string
  user_id: string
  session_id: string
  action_type: string
  document_id: string | null
  payload: Record<string, unknown>
  status: string
}

async function loadPendingAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string
): Promise<ActionRow | null> {
  const { data } = await supabase
    .from('chat_actions')
    .select('id, user_id, session_id, action_type, document_id, payload, status')
    .eq('id', actionId)
    .eq('user_id', userId)
    .single()
  if (!data || data.status !== 'pending') return null
  return data as ActionRow
}

async function executeUpdateNote(
  supabase: SupabaseClient,
  userId: string,
  action: ActionRow
): Promise<{ ok: boolean; message: string }> {
  const documentId = action.document_id
  if (!documentId) return { ok: false, message: 'Đề xuất không hợp lệ.' }

  const newContent = action.payload.new_content
  if (typeof newContent !== 'string' || !newContent.trim()) {
    return { ok: false, message: 'Nội dung mới không hợp lệ.' }
  }
  const newTitle =
    typeof action.payload.new_title === 'string' && action.payload.new_title.trim()
      ? action.payload.new_title.trim()
      : null

  // Re-verify at execution time — the note may have changed since the proposal
  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, file_type, r2_key, deleted_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (!doc || doc.deleted_at || doc.file_type !== 'note') {
    return { ok: false, message: 'Ghi chú không còn tồn tại hoặc đã bị xóa.' }
  }

  const updates: Record<string, unknown> = {
    note_content: newContent,
    file_size_bytes: Buffer.byteLength(newContent, 'utf8'),
    status: 'pending',
    chunk_count: null,
    error_message: null,
  }
  if (newTitle) updates.filename = newTitle

  const { error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', documentId)
    .eq('user_id', userId)

  if (error) {
    logger.error('chat action update_note failed', { err: error, documentId, userId })
    return { ok: false, message: 'Không cập nhật được ghi chú.' }
  }

  if (newTitle && newTitle !== doc.filename) {
    try {
      await updateDocumentFilename(userId, documentId, newTitle)
    } catch (err) {
      logger.error('Qdrant filename update failed', { err, documentId, userId })
    }
  }

  await enqueueIngestionJob({
    document_id: documentId,
    r2_key: doc.r2_key,
    file_type: 'note',
    user_id: userId,
  })

  return { ok: true, message: `Đã cập nhật ghi chú "${newTitle ?? doc.filename}".` }
}

async function executeDeleteNote(
  supabase: SupabaseClient,
  userId: string,
  action: ActionRow
): Promise<{ ok: boolean; message: string }> {
  const documentId = action.document_id
  if (!documentId) return { ok: false, message: 'Đề xuất không hợp lệ.' }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, file_type, deleted_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (!doc || doc.deleted_at || doc.file_type !== 'note') {
    return { ok: false, message: 'Ghi chú không còn tồn tại hoặc đã bị xóa.' }
  }

  const result = await softDeleteDocument(supabase, userId, documentId)
  if (!result.ok) {
    return { ok: false, message: 'Không xóa được ghi chú.' }
  }

  return {
    ok: true,
    message: `Đã chuyển ghi chú "${doc.filename}" vào thùng rác. Có thể nói "khôi phục note" để hoàn tác.`,
  }
}

async function executeRenameDocument(
  supabase: SupabaseClient,
  userId: string,
  action: ActionRow
): Promise<{ ok: boolean; message: string }> {
  const documentId = action.document_id
  const newName =
    typeof action.payload.new_name === 'string' ? action.payload.new_name.trim() : ''
  if (!documentId || !newName) return { ok: false, message: 'Đề xuất không hợp lệ.' }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, deleted_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()
  if (!doc || doc.deleted_at) {
    return { ok: false, message: 'Tài liệu không còn tồn tại.' }
  }

  const { error } = await supabase
    .from('documents')
    .update({ filename: newName })
    .eq('id', documentId)
    .eq('user_id', userId)
  if (error) {
    return { ok: false, message: 'Không đổi tên được tài liệu.' }
  }

  try {
    await updateDocumentFilename(userId, documentId, newName)
  } catch (err) {
    logger.error('Qdrant filename update failed', { err, documentId, userId })
  }

  return { ok: true, message: `Đã đổi tên "${doc.filename}" thành "${newName}".` }
}

async function executeMoveDocument(
  supabase: SupabaseClient,
  userId: string,
  action: ActionRow
): Promise<{ ok: boolean; message: string }> {
  const documentId = action.document_id
  if (!documentId) return { ok: false, message: 'Đề xuất không hợp lệ.' }
  const folderId = typeof action.payload.folder_id === 'string' ? action.payload.folder_id : null
  const folderName =
    typeof action.payload.folder_name === 'string' ? action.payload.folder_name : 'Thư mục gốc'

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, deleted_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()
  if (!doc || doc.deleted_at) {
    return { ok: false, message: 'Tài liệu không còn tồn tại.' }
  }

  if (folderId) {
    const { data: folder } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', userId)
      .single()
    if (!folder) {
      return { ok: false, message: 'Thư mục đích không còn tồn tại.' }
    }
  }

  const { error } = await supabase
    .from('documents')
    .update({ folder_id: folderId })
    .eq('id', documentId)
    .eq('user_id', userId)
  if (error) {
    return { ok: false, message: 'Không di chuyển được tài liệu.' }
  }

  return { ok: true, message: `Đã chuyển "${doc.filename}" vào ${folderName}.` }
}

async function executeTagDocument(
  supabase: SupabaseClient,
  userId: string,
  action: ActionRow
): Promise<{ ok: boolean; message: string }> {
  const documentId = action.document_id
  const tagIds = Array.isArray(action.payload.tag_ids)
    ? (action.payload.tag_ids as string[])
    : []
  if (!documentId || tagIds.length === 0) {
    return { ok: false, message: 'Đề xuất không hợp lệ.' }
  }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, deleted_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()
  if (!doc || doc.deleted_at) {
    return { ok: false, message: 'Tài liệu không còn tồn tại.' }
  }

  const { data: tags } = await supabase
    .from('tags')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', tagIds)
  if (!tags?.length) {
    return { ok: false, message: 'Tag không còn tồn tại.' }
  }

  // Additive: keep existing tags, ignore duplicates
  const { error } = await supabase.from('document_tags').upsert(
    tags.map((t) => ({ document_id: documentId, tag_id: t.id, user_id: userId })),
    { onConflict: 'document_id,tag_id', ignoreDuplicates: true }
  )
  if (error) {
    logger.error('chat action tag_document failed', { err: error, documentId, userId })
    return { ok: false, message: 'Không gắn được tag.' }
  }

  return {
    ok: true,
    message: `Đã gắn tag ${tags.map((t) => `"${t.name}"`).join(', ')} cho "${doc.filename}".`,
  }
}

/** Confirm & execute a pending chat action. */
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

  const rl = await checkRateLimit(user.id, 'chat', 20, 60, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { id } = await params
  const action = await loadPendingAction(supabase, user.id, id)
  if (!action) {
    return NextResponse.json({ error: 'Đề xuất không tồn tại hoặc đã xử lý.' }, { status: 404 })
  }

  const executors: Record<
    string,
    (s: SupabaseClient, u: string, a: ActionRow) => Promise<{ ok: boolean; message: string }>
  > = {
    update_note: executeUpdateNote,
    delete_note: executeDeleteNote,
    rename_document: executeRenameDocument,
    move_document: executeMoveDocument,
    tag_document: executeTagDocument,
  }

  const executor = executors[action.action_type]
  const result = executor
    ? await executor(supabase, user.id, action)
    : { ok: false, message: 'Loại đề xuất không hỗ trợ.' }

  await supabase
    .from('chat_actions')
    .update({
      status: result.ok ? 'executed' : 'failed',
      result: { message: result.message },
      executed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, message: result.message })
}

/** Cancel a pending chat action. */
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

  const { id } = await params
  const action = await loadPendingAction(supabase, user.id, id)
  if (!action) {
    return NextResponse.json({ error: 'Đề xuất không tồn tại hoặc đã xử lý.' }, { status: 404 })
  }

  await supabase
    .from('chat_actions')
    .update({ status: 'cancelled', executed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ success: true, message: 'Đã hủy đề xuất.' })
}
