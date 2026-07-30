import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { CHAT_MODELS, type ChatModelId } from '@/lib/ai/models'
import { logger } from '@/lib/logger'

export function getChatModelLabel(modelId: ChatModelId): string {
  return CHAT_MODELS.find((m) => m.id === modelId)?.label ?? modelId
}

export function getChatModelFallbackChain(modelId: ChatModelId): ChatModelId[] {
  switch (modelId) {
    case 'claude-opus-4-5':
      return ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5']
    case 'claude-sonnet-4-5':
      return ['claude-sonnet-4-5', 'claude-haiku-4-5']
    default:
      return [modelId]
  }
}

function extractErrorRecord(error: unknown): Record<string, unknown> | null {
  if (error == null) return null
  if (typeof error === 'object') return error as Record<string, unknown>

  return { message: String(error) }
}

export function isAnthropicOverloadError(error: unknown): boolean {
  const record = extractErrorRecord(error)
  if (!record) return false

  const type = record.type
  if (type === 'overloaded_error') return true

  const nested = record.error
  if (nested && typeof nested === 'object') {
    const nestedType = (nested as Record<string, unknown>).type
    if (nestedType === 'overloaded_error') return true
  }

  const message =
    typeof record.message === 'string'
      ? record.message
      : nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).message === 'string'
        ? ((nested as Record<string, unknown>).message as string)
        : ''

  return /overloaded/i.test(message)
}

export function formatChatStreamError(error: unknown, requestedModel: ChatModelId): string {
  if (isAnthropicOverloadError(error)) {
    if (requestedModel === 'claude-opus-4-5') {
      return 'Model Opus đang quá tải. Vui lòng đổi sang Sonnet hoặc Haiku, hoặc thử lại sau vài phút.'
    }
    return 'Model đang quá tải phía Anthropic. Vui lòng thử lại sau hoặc đổi sang model khác.'
  }

  if (error instanceof Error && error.message) {
    const msg = error.message
    if (/uuid|invalid|schema|tool/i.test(msg)) {
      return 'Không xử lý được thao tác trên ghi chú/tài liệu. Thử mô tả rõ tên note và nội dung cần sửa.'
    }
    return msg.length > 200 ? 'Đã xảy ra lỗi khi chat. Vui lòng thử lại.' : msg
  }

  const record = extractErrorRecord(error)
  const message = record?.message
  if (typeof message === 'string' && message && message !== '[object Object]') {
    return message.length > 200 ? 'Đã xảy ra lỗi khi chat. Vui lòng thử lại.' : message
  }

  return 'Đã xảy ra lỗi khi chat. Vui lòng thử lại.'
}

export function buildModelFallbackNotice(
  requestedModel: ChatModelId,
  activeModel: ChatModelId
): string {
  if (requestedModel === activeModel) return ''
  return `Model ${getChatModelLabel(requestedModel)} đang quá tải — đã tự động chuyển sang ${getChatModelLabel(activeModel)}.`
}

async function isModelStreamOverloaded(modelId: ChatModelId): Promise<boolean> {
  const result = streamText({
    model: anthropic(modelId),
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 1,
  })

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'error') {
      return isAnthropicOverloadError(chunk.error)
    }
    if (chunk.type === 'text-delta' || chunk.type === 'finish') {
      return false
    }
  }

  return false
}

export async function resolveChatModelWithFallback(requestedModel: ChatModelId): Promise<{
  modelId: ChatModelId
  fallbackNotice?: string
}> {
  const chain = getChatModelFallbackChain(requestedModel)

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i]
    const isLast = i === chain.length - 1

    if (!isLast) {
      const overloaded = await isModelStreamOverloaded(candidate)
      if (overloaded) {
        logger.warn('Anthropic model overloaded, trying fallback', {
          model: candidate,
          next: chain[i + 1],
          errorType: 'overloaded_error',
        })
        continue
      }
    }

    if (i > 0) {
      return {
        modelId: candidate,
        fallbackNotice: buildModelFallbackNotice(requestedModel, candidate),
      }
    }

    return { modelId: candidate }
  }

  const last = chain[chain.length - 1]
  return {
    modelId: last,
    fallbackNotice:
      last !== requestedModel
        ? buildModelFallbackNotice(requestedModel, last)
        : undefined,
  }
}
