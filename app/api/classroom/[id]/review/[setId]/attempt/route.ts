export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireMember } from '@/lib/classroom/acl'

type Ctx = { params: Promise<{ id: string; setId: string }> }

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, setId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }
  if (membership.role !== 'student') {
    return NextResponse.json({ error: 'Students only' }, { status: 403 })
  }

  let body: {
    action?: 'start' | 'submit' | 'blur'
    attempt_id?: string
    answers?: Record<string, unknown>
    tab_blur_count?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { data: set } = await supabase
    .from('review_sets')
    .select('id, status')
    .eq('id', setId)
    .eq('classroom_id', id)
    .single()

  if (!set || set.status !== 'published') {
    return NextResponse.json({ error: 'Review set not available' }, { status: 404 })
  }

  if (body.action === 'start') {
    const { data, error } = await supabase
      .from('review_attempts')
      .insert({
        review_set_id: setId,
        student_id: user.id,
        status: 'in_progress',
      })
      .select('id, started_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (body.action === 'blur') {
    if (!body.attempt_id) {
      return NextResponse.json({ error: 'attempt_id required' }, { status: 400 })
    }
    const { data: attempt } = await supabase
      .from('review_attempts')
      .select('id, tab_blur_count, status')
      .eq('id', body.attempt_id)
      .eq('student_id', user.id)
      .single()
    if (!attempt || attempt.status !== 'in_progress') {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
    }
    const next = (attempt.tab_blur_count ?? 0) + 1
    await supabase
      .from('review_attempts')
      .update({ tab_blur_count: next })
      .eq('id', attempt.id)
    return NextResponse.json({ tab_blur_count: next })
  }

  if (body.action === 'submit') {
    if (!body.attempt_id || !body.answers) {
      return NextResponse.json({ error: 'attempt_id and answers required' }, { status: 400 })
    }

    const { data: attempt } = await supabase
      .from('review_attempts')
      .select('*')
      .eq('id', body.attempt_id)
      .eq('student_id', user.id)
      .eq('review_set_id', setId)
      .single()

    if (!attempt || attempt.status !== 'in_progress') {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
    }

    const { data: items } = await supabase
      .from('review_items')
      .select('*')
      .eq('review_set_id', setId)

    let score = 0
    let maxScore = 0
    const details: Record<string, unknown> = {}

    for (const item of items ?? []) {
      const ans = body.answers[item.id]
      const payload = item.payload as Record<string, unknown>
      if (item.item_type === 'flashcard') {
        maxScore += 1
        const known = ans === true || ans === 'known'
        if (known) score += 1
        details[item.id] = { correct: known, type: 'flashcard' }
      } else if (item.item_type === 'mcq') {
        maxScore += 1
        const correct = normalizeAnswer(String(payload.answer ?? '')) === normalizeAnswer(String(ans ?? ''))
        if (correct) score += 1
        details[item.id] = { correct, type: 'mcq', expected: payload.answer }
      } else if (item.item_type === 'written') {
        maxScore += 1
        const accepted = Array.isArray(payload.accepted_answers)
          ? (payload.accepted_answers as string[])
          : payload.answer
            ? [String(payload.answer)]
            : []
        const correct =
          accepted.length > 0 &&
          accepted.some((a) => normalizeAnswer(a) === normalizeAnswer(String(ans ?? '')))
        if (correct) score += 1
        details[item.id] = {
          correct: accepted.length ? correct : null,
          type: 'written',
          needs_review: accepted.length === 0,
        }
      }
    }

    const blurCount = body.tab_blur_count ?? attempt.tab_blur_count ?? 0

    const { data: updated, error } = await supabase
      .from('review_attempts')
      .update({
        answers: { ...body.answers, _details: details },
        score,
        max_score: maxScore,
        tab_blur_count: blurCount,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
