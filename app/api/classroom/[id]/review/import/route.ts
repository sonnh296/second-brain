export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/db/server'
import {
  classroomImportR2Key,
  isAclError,
  requireTeacher,
  CLASSROOM_DOC_MAX_BYTES,
} from '@/lib/classroom/acl'
import { sanitizeFilename } from '@/lib/upload-limits'
import { mimeForType, typeFromExtension } from '@/lib/upload/file-types'
import { presignPutUrl, getObjectBuffer, headObject } from '@/lib/storage'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models'

type Ctx = { params: Promise<{ id: string }> }

/** Presign import file (teacher). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  let body: { filename?: string; size?: number; title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const size = Number(body.size)
  if (!body.filename || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'filename and size required' }, { status: 400 })
  }
  if (size > CLASSROOM_DOC_MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 })
  }

  const filename = sanitizeFilename(body.filename)
  const jobId = randomUUID()
  const r2Key = classroomImportR2Key(id, jobId, filename)
  const fileType = typeFromExtension(filename) ?? 'file'

  const { data: job, error } = await supabase
    .from('review_import_jobs')
    .insert({
      id: jobId,
      classroom_id: id,
      created_by: user.id,
      r2_key: r2Key,
      filename,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !job) {
    return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  }

  const uploadUrl = await presignPutUrl(r2Key, mimeForType(fileType))
  return NextResponse.json({
    job_id: job.id,
    upload_url: uploadUrl,
    content_type: mimeForType(fileType),
    title: body.title?.trim() || filename,
  })
}

/** After upload: extract text → AI → flashcards → create review set. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  let body: { job_id?: string; title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.job_id) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  }

  const { data: job } = await supabase
    .from('review_import_jobs')
    .select('*')
    .eq('id', body.job_id)
    .eq('classroom_id', id)
    .single()

  if (!job?.r2_key) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const head = await headObject(job.r2_key)
  if (!head) return NextResponse.json({ error: 'Upload missing' }, { status: 400 })

  await supabase
    .from('review_import_jobs')
    .update({ status: 'processing' })
    .eq('id', job.id)

  try {
    const { buffer } = await getObjectBuffer(job.r2_key)
    let rawText = buffer.toString('utf8')
    if (rawText.includes('\0') || rawText.length > 200_000) {
      rawText = rawText.replace(/\0/g, '').slice(0, 50000)
    }

    const { text } = await generateText({
      model: anthropic(DEFAULT_CHAT_MODEL),
      prompt: `Chuyển nội dung sau thành bộ flashcard JSON. Trả về ĐÚNG một JSON array (không markdown):
[{"front":"...","back":"..."}]
Tối đa 40 thẻ. Nội dung nguồn:
${rawText.slice(0, 40000)}`,
    })

    let cards: { front: string; back: string }[] = []
    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim()
      cards = JSON.parse(cleaned)
    } catch {
      throw new Error('AI không trả JSON hợp lệ')
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('Không tạo được flashcard')
    }

    const title = body.title?.trim() || job.filename || 'Flashcard import'
    const { data: set, error: setErr } = await supabase
      .from('review_sets')
      .insert({
        classroom_id: id,
        title,
        set_type: 'flashcard',
        status: 'draft',
        created_by: user.id,
        metadata: { schema_version: 1, imported_from: job.filename },
      })
      .select('id, title, status')
      .single()

    if (setErr || !set) throw new Error(setErr?.message ?? 'Create set failed')

    await supabase.from('review_items').insert(
      cards.slice(0, 40).map((c, i) => ({
        review_set_id: set.id,
        item_type: 'flashcard',
        prompt: String(c.front ?? ''),
        payload: {
          schema_version: 1,
          front: String(c.front ?? ''),
          back: String(c.back ?? ''),
        },
        sort_order: i,
      }))
    )

    await supabase
      .from('review_import_jobs')
      .update({
        status: 'done',
        review_set_id: set.id,
        raw_text: rawText.slice(0, 10000),
        result: { count: cards.length },
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({ set, card_count: cards.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('review_import_jobs')
      .update({
        status: 'failed',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
