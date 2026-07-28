import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { enqueueIngestionJob } from '@/lib/queue'
import { logger } from '@/lib/logger'

/** Restore a soft-deleted document from trash and re-index it. */
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

  const { id } = await params

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, file_type, r2_key, deleted_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc || !doc.deleted_at) {
    return NextResponse.json({ error: 'Không tìm thấy tài liệu trong thùng rác' }, { status: 404 })
  }

  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: null, status: 'pending', chunk_count: null, error_message: null })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Không khôi phục được tài liệu' }, { status: 500 })
  }

  try {
    await enqueueIngestionJob({
      document_id: doc.id,
      r2_key: doc.r2_key,
      file_type: doc.file_type,
      user_id: user.id,
    })
  } catch (err) {
    logger.error('Restore: reindex queue failed', { err, documentId: doc.id, userId: user.id })
  }

  return NextResponse.json({ success: true, filename: doc.filename })
}
