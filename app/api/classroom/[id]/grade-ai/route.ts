export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, isOwnedSubmissionR2Key, requireTeacher } from '@/lib/classroom/acl'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models'
import { getObjectBuffer } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'

type Ctx = { params: Promise<{ id: string }> }

/**
 * AI grade suggestion for a submission using a named rubric.
 * Teacher must confirm via PATCH grade action.
 */
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

  const rl = await checkRateLimit(user.id, 'classroom-grade-ai', 20, 3600, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many AI grade requests' }, { status: 429 })
  }

  let body: { submission_id?: string; rubric_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.submission_id || !body.rubric_id) {
    return NextResponse.json({ error: 'submission_id and rubric_id required' }, { status: 400 })
  }

  const { data: submission } = await supabase
    .from('assignment_submissions')
    .select('id, files, assignment_id, student_id')
    .eq('id', body.submission_id)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, classroom_id, title, description, max_score')
    .eq('id', submission.assignment_id)
    .eq('classroom_id', id)
    .single()

  if (!assignment) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { data: rubric } = await supabase
    .from('grading_rubrics')
    .select('id, name, criteria')
    .eq('id', body.rubric_id)
    .eq('classroom_id', id)
    .single()

  if (!rubric) return NextResponse.json({ error: 'Rubric not found' }, { status: 404 })

  const files =
    (submission.files as { file_id?: string; r2_key: string; filename: string }[]) ?? []
  let extracted = ''
  for (const f of files.slice(0, 3)) {
    if (
      !f.file_id ||
      !isOwnedSubmissionR2Key(f.r2_key, id, submission.assignment_id, submission.student_id, f.file_id)
    ) {
      continue
    }
    try {
      const { buffer } = await getObjectBuffer(f.r2_key)
      const text = buffer.toString('utf8')
      if (text.length < 200_000 && !text.includes('\0')) {
        extracted += `\n--- ${f.filename} ---\n${text.slice(0, 30000)}`
      } else {
        extracted += `\n--- ${f.filename} --- (binary/large file, không đọc text)`
      }
    } catch {
      extracted += `\n--- ${f.filename} --- (không đọc được)`
    }
  }

  const criteriaJson = JSON.stringify(rubric.criteria)

  const { text } = await generateText({
    model: anthropic(DEFAULT_CHAT_MODEL),
    prompt: `Bạn là giáo viên chấm bài. Chấm theo tiêu chí JSON sau và trả về ĐÚNG một JSON object (không markdown):
{"score": number, "comment": string, "breakdown": [{"criterion_id": string, "score": number, "max_score": number, "comment": string}]}

Điểm tối đa bài: ${assignment.max_score}
Bài tập: ${assignment.title}
Mô tả: ${assignment.description ?? ''}
Tiêu chí (${rubric.name}): ${criteriaJson}

Bài nộp của học sinh:
${extracted || '(không có nội dung text)'}`,
  })

  let suggestion: unknown
  try {
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim()
    suggestion = JSON.parse(cleaned)
  } catch {
    suggestion = { score: null, comment: text, breakdown: [], raw: text }
  }

  return NextResponse.json({
    suggestion,
    rubric_id: rubric.id,
    submission_id: submission.id,
  })
}
