export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { streamText, StreamData, type CoreMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createServerSupabaseClient } from '@/lib/db/server'
import { embedSingle } from '@/lib/ingestion/embed'
import {
  buildSystemPrompt,
  buildGeneralPrompt,
  buildKnowledgeNoContextPrompt,
  buildConversationalPrompt,
  buildDocumentManagementPrompt,
  resolveDisplayFilename,
} from '@/lib/ai/prompt'
import { isGreeting, isDocumentInventoryQuery, isDocumentManagementQuery } from '@/lib/ai/query-intent'
import { parseCitationsFromResponse } from '@/lib/ai/citations'
import { rerankChunks, RERANK_CANDIDATES } from '@/lib/ai/rerank'
import { hybridSearch } from '@/lib/search/hybrid'
import { filterRelevantChunks } from '@/lib/search/relevance-filter'
import {
  searchDocumentInventory,
  listUserDocumentCatalog,
} from '@/lib/search/document-inventory'
import { isDefaultSessionTitle, generateSessionTitle } from '@/lib/ai/session-title'
import { checkRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { DEFAULT_CHAT_MODEL, isValidChatModel } from '@/lib/ai/models'
import { persistChatImages, buildMultimodalHistory } from '@/lib/chat/attachments'
import { buildNoteTools, NOTE_TOOLS_PROMPT } from '@/lib/chat/note-tools'
import { fromAiSdkSteps, logUsage } from '@/lib/usage/log'

const CHAT_HISTORY_LIMIT = Number(process.env.CHAT_HISTORY_LIMIT ?? 10)

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})

const ImageAttachmentSchema = z.object({
  type: z.literal('base64'),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  data: z.string().min(1),
})

const ChatSchema = z.object({
  session_id: z.string().uuid(),
  model: z.string().optional(),
  mode: z.enum(['knowledge', 'general']).optional().default('knowledge'),
  message: z.string().min(1).max(4000).optional(),
  messages: z.array(MessageSchema).optional(),
  images: z.array(ImageAttachmentSchema).max(5).optional().default([]),
}).superRefine((data, ctx) => {
  const hasMessage = !!data.message?.trim()
  const lastUser = data.messages?.filter((m) => m.role === 'user').at(-1)
  const hasMessages = !!lastUser?.content?.trim()
  const hasImages = (data.images?.length ?? 0) > 0

  if (!hasMessage && !hasMessages && !hasImages) {
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

type ImageAttachment = z.infer<typeof ImageAttachmentSchema>

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
  const { session_id, mode, images } = parsed.data
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
    document_id?: string
    file_type?: string
    page?: number
  }[] = []
  let usedKnowledge = false
  let noContext = false
  let conversational = false
  let documentManagement = false
  const hasTextMessage = message.trim().length > 0

  if (mode === 'knowledge') {
    if (!hasTextMessage && images.length > 0) {
      // Image-only turns should not spend embedding / retrieval budget on an empty query.
      conversational = true
    } else if (isGreeting(message)) {
      conversational = true
    } else if (isDocumentManagementQuery(message)) {
      // Skip RAG — rename/move/tag/note tools need Postgres search, not chunk retrieval.
      // Running RAG here causes lag and a misleading "no documents" system prompt.
      documentManagement = true
    } else {
      const questionVector = await embedSingle(message, {
        userId,
        purpose: 'embedding_query',
      })
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
          .select('id, filename, file_type')
          .in('id', documentIds)

        const filenameByDocId = new Map(
          (docRecords ?? []).map((d) => [d.id, d.filename])
        )
        const fileTypeByDocId = new Map(
          (docRecords ?? []).map((d) => [d.id, d.file_type as string])
        )

        const resolveFilename = (r: (typeof relevantChunks)[0]) =>
          resolveDisplayFilename(
            r.payload.filename,
            r.payload.document_id,
            filenameByDocId
          )

        const reranked = await rerankChunks(message, relevantChunks, resolveFilename)
        usedKnowledge = reranked.length > 0
        sources = reranked.map((r) => ({
          ...r,
          file_type: fileTypeByDocId.get(r.document_id),
        }))
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
    .select('id, role, content')
    .eq('session_id', session_id)
    .order('created_at', { ascending: false })
    .limit(CHAT_HISTORY_LIMIT)

  const historyRows = (history ?? []).reverse()
  const historyIds = historyRows.map((m) => m.id)

  let attachmentsByMessage = new Map<
    string,
    { id: string; r2_key: string; media_type: string }[]
  >()
  if (historyIds.length > 0) {
    const { data: atts } = await supabase
      .from('message_attachments')
      .select('id, message_id, r2_key, media_type')
      .in('message_id', historyIds)

    attachmentsByMessage = new Map()
    for (const a of atts ?? []) {
      const list = attachmentsByMessage.get(a.message_id) ?? []
      list.push({ id: a.id, r2_key: a.r2_key, media_type: a.media_type })
      attachmentsByMessage.set(a.message_id, list)
    }
  }

  const historyMessages = await buildMultimodalHistory(
    historyRows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      attachments: attachmentsByMessage.get(m.id),
    }))
  )

  const systemPrompt = conversational
    ? buildConversationalPrompt()
    : documentManagement
      ? buildDocumentManagementPrompt()
      : usedKnowledge
        ? buildSystemPrompt(sources)
        : noContext
          ? buildKnowledgeNoContextPrompt()
          : buildGeneralPrompt()

  const streamData = new StreamData()
  if (noContext && !conversational && !documentManagement) {
    streamData.append({
      no_context: true,
      message:
        'Không tìm thấy tài liệu liên quan — trả lời dựa trên kiến thức chung.',
    })
  }

  let pendingActionCount = 0
  const noteTools = buildNoteTools({
    supabase,
    userId,
    sessionId: session_id,
    onPendingAction: (action) => {
      pendingActionCount += 1
      streamData.append({ pending_action: { ...action } })
    },
  })

  // Build user content — multimodal if images are attached
  type ImagePart = { type: 'image'; image: string; mimeType: string }
  type TextPart = { type: 'text'; text: string }
  const userContent: string | Array<ImagePart | TextPart> =
    images && images.length > 0
      ? [
          ...images.map((img: ImageAttachment): ImagePart => ({
            type: 'image',
            image: img.data,
            mimeType: img.mediaType,
          })),
          { type: 'text', text: message || '(Hãy phân tích ảnh trên)' } satisfies TextPart,
        ]
      : message

  const result = streamText({
    model: anthropic(modelId),
    system: systemPrompt + '\n' + NOTE_TOOLS_PROMPT,
    messages: [
      ...historyMessages,
      { role: 'user', content: userContent },
    ] as CoreMessage[],
    tools: noteTools,
    maxSteps: 5,
    experimental_providerMetadata: {
      anthropic: {
        cacheControl: { type: 'ephemeral' },
      },
    },
    onFinish: async ({ text, usage, steps }) => {
      try {
        // Tool-only turns often return empty text; keep a visible reply when proposals exist.
        const rawText =
          text.trim() ||
          (pendingActionCount > 0
            ? 'Đã tạo đề xuất. Vui lòng bấm **Xác nhận** trong thẻ bên dưới để áp dụng.'
            : '')
        const { content, citedSources } = parseCitationsFromResponse(rawText, sources)

        const chatTokens = fromAiSdkSteps(steps, usage)
        await logUsage({
          userId,
          purpose: 'chat',
          model: modelId,
          ...chatTokens,
          metadata: {
            session_id,
            mode,
            document_management: documentManagement,
            steps: steps?.length ?? 1,
          },
        })

        // Push citations to the client immediately so badges render without a reload
        if (citedSources.length > 0) {
          streamData.append({ cited_sources: JSON.parse(JSON.stringify(citedSources)) })
        }

        const userTextContent = message || '(Ảnh đính kèm)'

        const { data: userMsg, error: userErr } = await supabase
          .from('messages')
          .insert({
            session_id,
            role: 'user',
            content: userTextContent,
            cited_sources: [],
          })
          .select('id')
          .single()

        if (userErr || !userMsg) {
          logger.error('Failed to persist user message', {
            err: userErr,
            userId,
            sessionId: session_id,
          })
        } else if (images && images.length > 0) {
          try {
            const stored = await persistChatImages(
              userId,
              session_id,
              images.map((img) => ({ mediaType: img.mediaType, data: img.data }))
            )
            if (stored.length > 0) {
              const { error: attErr } = await supabase.from('message_attachments').insert(
                stored.map((s) => ({
                  id: s.id,
                  message_id: userMsg.id,
                  user_id: userId,
                  r2_key: s.r2_key,
                  media_type: s.media_type,
                  filename: s.filename,
                  byte_size: s.byte_size,
                }))
              )
              if (attErr) {
                logger.error('Failed to persist message attachments', {
                  err: attErr,
                  userId,
                  sessionId: session_id,
                })
              }
            }
          } catch (err) {
            logger.error('Failed to upload chat images', {
              err,
              userId,
              sessionId: session_id,
            })
          }
        }

        if (content.trim()) {
          const { error: asstErr } = await supabase.from('messages').insert({
            session_id,
            role: 'assistant',
            content,
            cited_sources: citedSources,
          })

          if (asstErr) {
            logger.error('Failed to persist assistant message', {
              err: asstErr,
              userId,
              sessionId: session_id,
            })
          }
        }

        if (
          session &&
          isDefaultSessionTitle(session.title) &&
          historyMessages.length === 0
        ) {
          const title = await generateSessionTitle(message, { userId })
          const { error: titleErr } = await supabase
            .from('chat_sessions')
            .update({ title })
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

  return result.toDataStreamResponse({
    data: streamData,
    getErrorMessage: (error) => {
      logger.error('Chat stream error', { err: error, userId, sessionId: session_id })
      if (error instanceof Error && error.message) {
        // Avoid leaking internal stack; keep a short actionable message
        const msg = error.message
        if (/uuid|invalid|schema|tool/i.test(msg)) {
          return 'Không xử lý được thao tác trên ghi chú/tài liệu. Thử mô tả rõ tên note và nội dung cần sửa.'
        }
        return msg.length > 200 ? 'Đã xảy ra lỗi khi chat. Vui lòng thử lại.' : msg
      }
      return 'Đã xảy ra lỗi khi chat. Vui lòng thử lại.'
    },
  })
}
