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
import {
  formatClassroomCatalog,
  loadClassroomCatalog,
  parseLessonIndexFromQuery,
  resolveLessonDocumentIds,
} from '@/lib/classroom/catalog'
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
    file_type?: string
  }[] = []

  let catalogText = ''
  let focusedLesson: { title: string; filenames: string[] } | null = null
  let focusedDocs: {
    id: string
    filename: string
    file_type: string
  }[] = []

  try {
    const catalog = await loadClassroomCatalog(supabase, classroomId)
    catalogText = formatClassroomCatalog(catalog)

    const lessonIndex = parseLessonIndexFromQuery(message)
    let documentIds: string[] | undefined
    if (lessonIndex != null) {
      const resolved = resolveLessonDocumentIds(catalog, lessonIndex)
      if (resolved) {
        focusedLesson = {
          title: resolved.lessonTitle,
          filenames: resolved.filenames,
        }
        focusedDocs = resolved.documents.map((d) => ({
          id: d.id,
          filename: d.filename,
          file_type: d.file_type,
        }))
        documentIds = resolved.documentIds
      } else {
        focusedLesson = {
          title: `Buổi ${lessonIndex}`,
          filenames: [],
        }
        documentIds = []
      }
    }

    const questionVector = await embedSingle(message, {
      userId: user.id,
      purpose: 'embedding_query',
    })
    const retrieved = await hybridSearchClassroom(
      supabase,
      classroomId,
      message,
      questionVector,
      RERANK_CANDIDATES,
      { documentIds }
    )
    let relevant = filterRelevantChunks(retrieved)

    // Lesson listing with no semantic hits — still pull a few chunks from those docs.
    if (relevant.length === 0 && documentIds && documentIds.length > 0) {
      const filenameById = new Map<string, string>()
      for (const lesson of catalog.lessons) {
        for (const d of lesson.documents) filenameById.set(d.id, d.filename)
      }
      for (const d of catalog.shared) filenameById.set(d.id, d.filename)

      const { data: fallbackChunks } = await supabase
        .from('classroom_document_chunks')
        .select('document_id, chunk_index, chunk_text')
        .in('document_id', documentIds)
        .order('chunk_index', { ascending: true })
        .limit(12)

      relevant = (fallbackChunks ?? []).map((c, i) => ({
        point_id: '',
        score: 1 - i * 0.01,
        payload: {
          user_id: user.id,
          document_id: c.document_id as string,
          filename: filenameById.get(c.document_id as string) || 'document',
          chunk_index: c.chunk_index as number,
          chunk_text: c.chunk_text as string,
          classroom_id: classroomId,
          product: 'classroom' as const,
        },
      }))
    }

    if (relevant.length > 0) {
      sources = await rerankChunks(message, relevant, (r) => r.payload.filename)
    }

    const fileTypeById = new Map<string, string>()
    for (const lesson of catalog.lessons) {
      for (const d of lesson.documents) fileTypeById.set(d.id, d.file_type)
    }
    for (const d of catalog.shared) fileTypeById.set(d.id, d.file_type)

    for (const s of sources) {
      if (!s.file_type) s.file_type = fileTypeById.get(s.document_id)
    }

    // Ensure focused lesson files are citable even when only catalog-level listing.
    if (focusedDocs.length > 0) {
      const seen = new Set(sources.map((s) => s.document_id))
      for (const doc of focusedDocs) {
        if (seen.has(doc.id)) continue
        sources.push({
          filename: doc.filename,
          chunk_index: 0,
          chunk_text: `Tài liệu thuộc ${focusedLesson?.title ?? 'buổi học'}: ${doc.filename}`,
          score: 0.5,
          document_id: doc.id,
          file_type: doc.file_type,
        })
        seen.add(doc.id)
      }
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
    system: buildClassroomSystemPrompt(sources, {
      catalogText,
      focusedLesson,
    }),
    messages,
    async onFinish({ text, usage, steps }) {
      let { content, citedSources } = parseCitationsFromResponse(text, sources)

      // If model listed lesson files but forgot CITATIONS, attach focused docs.
      if (citedSources.length === 0 && focusedDocs.length > 0) {
        const lower = content.toLowerCase()
        const mentioned = focusedDocs.filter((d) =>
          lower.includes(d.filename.toLowerCase())
        )
        const docsToCite = mentioned.length > 0 ? mentioned : focusedDocs
        citedSources = docsToCite.map((d) => ({
          filename: d.filename,
          chunk_index: 0,
          document_id: d.id,
          file_type: d.file_type,
        }))
      }

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
