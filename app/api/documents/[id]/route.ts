import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { deleteObject } from '@/lib/storage'
import { deleteByDocument, updateDocumentFilename } from '@/lib/vector'
import { enqueueIngestionJob, enqueueDocumentCleanupJob } from '@/lib/queue'
import { logger } from '@/lib/logger'

const UpdateDocumentSchema = z.object({
  filename: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  note_content: z.string().min(1).max(50000).optional(),
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
    .select('id, file_type, r2_key, filename')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.filename !== undefined) updates.filename = parsed.data.filename
  if (parsed.data.description !== undefined) updates.description = parsed.data.description

  let shouldReingest = false
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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', documentId)
    .select('id, filename, file_type, status, description, note_content, file_size_bytes, chunk_count, error_message, created_at')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }

  if (parsed.data.filename && parsed.data.filename !== doc.filename) {
    try {
      await updateDocumentFilename(user.id, documentId, parsed.data.filename)
    } catch (err) {
      logger.error('Qdrant filename update failed', { err, documentId, userId: user.id })
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

  return NextResponse.json(updated)
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

  const { id: documentId } = await params

  // Verify ownership and fetch r2_key
  const { data: doc } = await supabase
    .from('documents')
    .select('id, r2_key')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const failures: ('qdrant' | 'r2')[] = []

  // Step 1: Delete from Qdrant
  try {
    await deleteByDocument(user.id, documentId)
  } catch (err) {
    logger.error('Qdrant deletion failed', { err, documentId, userId: user.id })
    failures.push('qdrant')
  }

  // Step 2: Delete from R2 (notes have no file in storage)
  if (doc.r2_key !== 'note' && !doc.r2_key.startsWith('notes/')) {
    try {
      await deleteObject(doc.r2_key)
    } catch (err) {
      logger.error('R2 deletion failed', { err, documentId, userId: user.id, r2Key: doc.r2_key })
      failures.push('r2')
    }
  }

  // Step 3: Delete from Postgres (cascade removes document_chunks)
  const { error: pgErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', user.id)

  if (pgErr) {
    logger.error('Postgres deletion failed', { err: pgErr, documentId, userId: user.id })
    return NextResponse.json(
      { error: 'Failed to delete document record', failed_steps: [...failures, 'postgres'] },
      { status: 500 }
    )
  }

  if (failures.length > 0) {
    try {
      await enqueueDocumentCleanupJob({
        user_id: user.id,
        document_id: documentId,
        r2_key: doc.r2_key,
        steps: failures,
      })
    } catch (err) {
      logger.error('Failed to enqueue document cleanup job', {
        err,
        documentId,
        userId: user.id,
        failedSteps: failures,
      })
    }

    return NextResponse.json({
      success: true,
      cleanup_queued: true,
      failed_steps: failures,
    })
  }

  return NextResponse.json({ success: true })
}
