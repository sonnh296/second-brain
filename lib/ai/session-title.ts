import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models'
import { logger } from '@/lib/logger'
import { fromAiSdkUsage, logUsage } from '@/lib/usage/log'

export const DEFAULT_SESSION_TITLES = ['New Chat', 'Cuộc trò chuyện mới'] as const

export function titleFromFirstMessage(message: string, maxLen = 40): string {
  const oneLine = message.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'Cuộc trò chuyện mới'
  if (oneLine.length <= maxLen) return oneLine
  return oneLine.slice(0, maxLen) + '...'
}

export function isDefaultSessionTitle(title: string): boolean {
  return (DEFAULT_SESSION_TITLES as readonly string[]).includes(title)
}

function cleanGeneratedTitle(raw: string, maxLen = 40): string | null {
  const cleaned = raw
    .replace(/^[\s"'«»“”‘’]+|[\s"'«»“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  if (cleaned.length <= maxLen) return cleaned
  return cleaned.slice(0, maxLen).trimEnd() + '...'
}

/** Short AI-generated title from the first user question; falls back to truncated text. */
export async function generateSessionTitle(
  message: string,
  opts?: { userId?: string }
): Promise<string> {
  const fallback = titleFromFirstMessage(message, 40)
  const question = message.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!question) return 'Cuộc trò chuyện mới'

  try {
    const { text, usage } = await generateText({
      model: anthropic(DEFAULT_CHAT_MODEL),
      maxTokens: 40,
      temperature: 0.3,
      prompt: [
        'Đặt một tên ngắn cho cuộc trò chuyện dựa trên câu hỏi đầu tiên của người dùng.',
        'Quy tắc: tối đa 6 từ; cùng ngôn ngữ với câu hỏi; chỉ trả về tên; không dấu ngoặc kép; không giải thích.',
        '',
        `Câu hỏi: ${question}`,
      ].join('\n'),
    })

    if (opts?.userId) {
      const tokens = fromAiSdkUsage(usage)
      await logUsage({
        userId: opts.userId,
        purpose: 'title',
        model: DEFAULT_CHAT_MODEL,
        ...tokens,
      })
    }

    return cleanGeneratedTitle(text) ?? fallback
  } catch (err) {
    logger.error('Failed to generate session title', { err })
    return fallback
  }
}
