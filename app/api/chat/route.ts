export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { streamText, StreamData } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createServerSupabaseClient } from '@/lib/db/server'
import { embedSingle } from '@/lib/ingestion/embed'
import {
  buildSystemPrompt,
  buildGeneralPrompt,
  buildKnowledgeNoContextPrompt,
  buildConversationalPrompt,
  resolveDisplayFilename,
} from '@/lib/ai/prompt'
import { isGreeting, isDocumentInventoryQuery } from '@/lib/ai/query-intent'
import { parseCitationsFromResponse } from '@/lib/ai/citations'
import { rerankChunks, RERANK_CANDIDATES } from '@/lib/ai/rerank'
import { hybridSearch } from '@/lib/search/hybrid'
import { filterRelevantChunks } from '@/lib/search/relevance-filter'
import {
  searchDocumentInventory,
  listUserDocumentCatalog,
} from '@/lib/search/document-inventory'
import { isDefaultSessionTitle, titleFromFirstMessage } from '@/lib/ai/session-title'
import { checkRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { DEFAULT_CHAT_MODEL, isValidChatModel } from '@/lib/ai/models'

const CHAT_HISTORY_LIMIT = Number(process.env.CHAT_HISTORY_LIMIT ?? 10)

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})

const ChatSchema = z.object({
  session_id: z.string().uuid(),
  model: z.string().optional(),
  mode: z.enum(['knowledge', 'general']).optional().default('knowledge'),
  message: z.string().min(1).max(4000).optional(),
  messages: z.array(MessageSchema).optional(),
}).superRefine((data, ctx) => {
  const hasMessage = !!data.message?.trim()
  const lastUser = data.messages?.filter((m) => m.role === 'user').at(-1)
  const hasMessages = !!lastUser?.content?.trim()

  if (!hasMessage && !hasMessages) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Required',
      path: ['message'],
    })
  }
})

function extractUserMessage(body: z.infer<typeof ChatSchema>): string {
  if (body.message?.trim()) return body.message.trim()
  const lastUser = body.messages?.filter((m) => m.role === 'user').at(-1)
  return lastUser?.content?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id

  const rl = await checkRateLimit(userId, 'chat', 20, 60, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = ChatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { session_id, mode } = parsed.data
  const message = extractUserMessage(parsed.data)
  const modelId =
    parsed.data.model && isValidChatModel(parsed.data.model)
      ? parsed.data.model
      : process.env.CLAUDE_MODEL && isValidChatModel(process.env.CLAUDE_MODEL)
        ? process.env.CLAUDE_MODEL
        : DEFAULT_CHAT_MODEL

  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, title')
    .eq('id', session_id)
    .eq('user_id', userId)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  let sources: {
    filename: string
    chunk_index: number
    chunk_text: string
    score: number
  }[] = []
  let usedKnowledge = false
  let noContext = false
  let conversational = false

  if (mode === 'knowledge') {
    if (isGreeting(message)) {
      conversational = true
    } else {
      const questionVector = await embedSingle(message)
      let retrievedChunks: Awaited<ReturnType<typeof hybridSearch>> = []
      try {
        retrievedChunks = await hybridSearch(
          supabase,
          userId,
          message,
          questionVector,
          RERANK_CANDIDATES
        )
      } catch (err) {
        logger.error('RAG search failed', { err, userId, sessionId: session_id })
        noContext = true
      }

      const relevantChunks = filterRelevantChunks(retrievedChunks)

      if (relevantChunks.length > 0) {
        const documentIds = [...new Set(relevantChunks.map((r) => r.payload.document_id))]
        const { data: docRecords } = await supabase
          .from('documents')
          .select('id, filename')
          .in('id', documentIds)

        const filenameByDocId = new Map(
          (docRecords ?? []).map((d) => [d.id, d.filename])
        )

        const resolveFilename = (r: (typeof relevantChunks)[0]) =>
          resolveDisplayFilename(
            r.payload.filename,
            r.payload.document_id,
            filenameByDocId
          )

        const reranked = await rerankChunks(message, relevantChunks, resolveFilename)
        usedKnowledge = reranked.length > 0
        sources = reranked
      } else if (isDocumentInventoryQuery(message)) {
        const inventory = await searchDocumentInventory(supabase, userId, message)
        if (inventory.length > 0) {
          usedKnowledge = true
          sources = inventory.map((s) => ({ ...s, score: 1 }))
        } else {
          const catalog = await listUserDocumentCatalog(supabase, userId)
          if (catalog.length > 0) {
            usedKnowledge = true
            sources = catalog.map((s) => ({ ...s, score: 1 }))
          } else {
            noContext = true
          }
        }
      } else {
        noContext = true
      }
    }
  }

  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', session_id)
    .order('created_at', { ascending: false })
    .limit(CHAT_HISTORY_LIMIT)

  const historyMessages = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const systemPrompt = conversational
    ? buildConversationalPrompt()
    : usedKnowledge
      ? buildSystemPrompt(sources)
      : noContext
        ? buildKnowledgeNoContextPrompt()
        : buildGeneralPrompt()

  const streamData = new StreamData()
  if (noContext && !conversational) {
    streamData.append({
      no_context: true,
      message:
        'Không tìm thấy tài liệu liên quan — trả lời dựa trên kiến thức chung.',
    })
  }

  const result = streamText({
    model: anthropic(modelId),
    system: systemPrompt,
    messages: [...historyMessages, { role: 'user', content: message }],
    experimental_providerMetadata: {
      anthropic: {
        cacheControl: { type: 'ephemeral' },
      },
    },
    onFinish: async ({ text }) => {
      try {
        const { content, citedSources } = parseCitationsFromResponse(text, sources)

        const { error: msgErr } = await supabase.from('messages').insert([
          {
            session_id,
            role: 'user',
            content: message,
            cited_sources: [],
          },
          {
            session_id,
            role: 'assistant',
            content,
            cited_sources: citedSources,
          },
        ])

        if (msgErr) {
          logger.error('Failed to persist chat messages', {
            err: msgErr,
            userId,
            sessionId: session_id,
          })
        }

        if (
          session &&
          isDefaultSessionTitle(session.title) &&
          historyMessages.length === 0
        ) {
          const { error: titleErr } = await supabase
            .from('chat_sessions')
            .update({ title: titleFromFirstMessage(message) })
            .eq('id', session_id)
            .eq('user_id', userId)

          if (titleErr) {
            logger.error('Failed to update session title', {
              err: titleErr,
              userId,
              sessionId: session_id,
            })
          }
        }
      } catch (err) {
        logger.error('Chat onFinish failed', { err, userId, sessionId: session_id })
      } finally {
        streamData.close()
      }
    },
  })

  return result.toDataStreamResponse({ data: streamData })
}
