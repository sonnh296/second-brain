export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { streamText, type CoreMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createServerSupabaseClient } from '@/lib/db/server'
import { embedSingle } from '@/lib/ingestion/embed'
import { parseCitationsFromResponse } from '@/lib/ai/citations'
import { rerankChunks, RERANK_CANDIDATES } from '@/lib/ai/rerank'
import { filterRelevantChunks } from '@/lib/search/relevance-filter'
import { hybridSearchClassroom } from '@/lib/classroom/search'
import { isAclError, requireMember } from '@/lib/classroom/acl'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveChatModelWithFallback } from '@/lib/ai/chat-errors'
import { DEFAULT_CHAT_MODEL, isValidChatModel, type ChatModelId } from '@/lib/ai/models'
import { fromAiSdkSteps, logUsage } from '@/lib/usage/log'
import { buildClassroomSystemPrompt } from '@/lib/classroom/prompt'
import { logger } from '@/lib/logger'

const ChatSchema = z.object({
  session_id: z.string().uuid(),
  model: z.string().optional(),
  message: z.string().min(1).max(4000),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: classroomId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireMember(supabase, classroomId, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const rl = await checkRateLimit(user.id, 'classroom-chat', 20, 60, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = ChatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('classroom_chat_sessions')
    .select('id')
    .eq('id', parsed.data.session_id)
    .eq('classroom_id', classroomId)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const message = parsed.data.message.trim()
  const requestedModel: ChatModelId =
    parsed.data.model && isValidChatModel(parsed.data.model)
      ? parsed.data.model
      : DEFAULT_CHAT_MODEL
  const { modelId } = await resolveChatModelWithFallback(requestedModel)

  let sources: {
    filename: string
    chunk_index: number
    chunk_text: string
    score: number
    document_id: string
  }[] = []

  try {
    const questionVector = await embedSingle(message, {
      userId: user.id,
      purpose: 'embedding_query',
    })
    const retrieved = await hybridSearchClassroom(
      supabase,
      classroomId,
      message,
      questionVector,
      RERANK_CANDIDATES
    )
    const relevant = filterRelevantChunks(retrieved)
    if (relevant.length > 0) {
      sources = await rerankChunks(message, relevant, (r) => r.payload.filename)
    }
  } catch (err) {
    logger.error('Classroom RAG failed', { err, classroomId })
  }

  const { data: history } = await supabase
    .from('classroom_chat_messages')
    .select('role, content')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .limit(10)

  const messages: CoreMessage[] = [
    ...(history ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ]

  const result = streamText({
    model: anthropic(modelId),
    system: buildClassroomSystemPrompt(sources),
    messages,
    async onFinish({ text, usage, steps }) {
      const { content, citedSources } = parseCitationsFromResponse(text, sources)
      await supabase.from('classroom_chat_messages').insert([
        { session_id: session.id, role: 'user', content: message },
        {
          session_id: session.id,
          role: 'assistant',
          content,
          cited_sources: citedSources,
        },
      ])
      try {
        const tokens = fromAiSdkSteps(steps, usage)
        await logUsage({
          userId: user.id,
          purpose: 'chat',
          model: modelId,
          ...tokens,
          metadata: { classroom_id: classroomId, product: 'classroom' },
        })
      } catch {
        /* usage logging must not break chat */
      }
    },
  })

  return result.toDataStreamResponse()
}
