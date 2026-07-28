import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { deleteObject } from '@/lib/storage'
import { logger } from '@/lib/logger'

const UpdateSessionSchema = z.object({
  title: z.string().min(1).max(200),
})

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

  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, content, cited_sources, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  const messageList = messages ?? []
  const messageIds = messageList.map((m) => m.id)

  let attachmentsByMessage = new Map<
    string,
    { id: string; media_type: string; filename: string }[]
  >()

  if (messageIds.length > 0) {
    const { data: attachments } = await supabase
      .from('message_attachments')
      .select('id, message_id, media_type, filename')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true })

    for (const a of attachments ?? []) {
      const list = attachmentsByMessage.get(a.message_id) ?? []
      list.push({ id: a.id, media_type: a.media_type, filename: a.filename })
      attachmentsByMessage.set(a.message_id, list)
    }
  }

  const messagesWithAttachments = messageList.map((m) => ({
    ...m,
    attachments: attachmentsByMessage.get(m.id) ?? [],
  }))

  const { data: pendingActions } = await supabase
    .from('chat_actions')
    .select('id, action_type, document_id, payload')
    .eq('session_id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const pending_actions = (pendingActions ?? []).map((a) => {
    const payload = (a.payload ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === 'string' ? v : null)
    const filename =
      str(payload.new_title) || str(payload.old_title) || str(payload.title) || 'Ghi chú'

    let preview = str(payload.preview)
    if (!preview) {
      if (a.action_type === 'rename_document' && str(payload.new_name)) {
        preview = `Tên mới: ${payload.new_name}`
      } else if (a.action_type === 'move_document' && str(payload.folder_name)) {
        preview = `Chuyển vào: ${payload.folder_name}`
      } else if (a.action_type === 'tag_document' && Array.isArray(payload.tag_names)) {
        preview = `Gắn tag: ${(payload.tag_names as string[]).join(', ')}`
      }
    }

    return {
      id: a.id,
      action_type: a.action_type,
      document_id: a.document_id,
      filename,
      preview,
    }
  })

  return NextResponse.json({ session, messages: messagesWithAttachments, pending_actions })
}

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

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = UpdateSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .update({ title: parsed.data.title })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, title, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

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

  // Verify ownership before deleting
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Collect R2 keys before cascade delete
  const { data: messages } = await supabase
    .from('messages')
    .select('id')
    .eq('session_id', id)

  const messageIds = (messages ?? []).map((m) => m.id)
  let r2Keys: string[] = []
  if (messageIds.length > 0) {
    const { data: attachments } = await supabase
      .from('message_attachments')
      .select('r2_key')
      .in('message_id', messageIds)
    r2Keys = (attachments ?? []).map((a) => a.r2_key).filter(Boolean)
  }

  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }

  // Best-effort R2 cleanup after DB delete
  await Promise.all(
    r2Keys.map(async (key) => {
      try {
        await deleteObject(key)
      } catch (err) {
        logger.error('Failed to delete chat attachment from R2', { err, key, sessionId: id })
      }
    })
  )

  return NextResponse.json({ success: true })
}
