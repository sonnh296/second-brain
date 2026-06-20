import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { enqueueIngestionJob } from '@/lib/queue'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkDocumentQuota, quotaStatusCode } from '@/lib/upload-limits'
import { cleanupFailedUpload } from '@/lib/upload/cleanup-document'
import { logger } from '@/lib/logger'

const CreateNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
})

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id

  const rl = await checkRateLimit(userId, 'upload', 10, 3600, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = CreateNoteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { title, content } = parsed.data
  const contentBytes = Buffer.byteLength(content, 'utf8')

  try {
    const quota = await checkDocumentQuota(supabase, userId, contentBytes)
    if (!quota.ok) {
      return NextResponse.json(
        { error: quota.error.message },
        { status: quotaStatusCode(quota.error) }
      )
    }

    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        filename: title,
        file_type: 'note',
        r2_key: 'note',
        note_content: content,
        file_size_bytes: contentBytes,
        status: 'pending',
      })
      .select('id')
      .single()

    if (docErr || !doc) {
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
    }

    const r2Key = `notes/${userId}/${doc.id}`
    await supabase.from('documents').update({ r2_key: r2Key }).eq('id', doc.id)

    try {
      await enqueueIngestionJob({
        document_id: doc.id,
        r2_key: r2Key,
        file_type: 'note',
        user_id: userId,
      })
    } catch (err) {
      logger.error('Failed to queue note for ingestion', { err, userId, documentId: doc.id })
      await cleanupFailedUpload(supabase, doc.id, userId, r2Key)
      return NextResponse.json({ error: 'Failed to queue note for processing' }, { status: 500 })
    }

    return NextResponse.json({ document_id: doc.id, status: 'pending' }, { status: 201 })
  } catch (err) {
    logger.error('Note creation failed', { err, userId })
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
