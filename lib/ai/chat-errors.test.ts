import { describe, expect, it } from 'vitest'
import {
  buildModelFallbackNotice,
  formatChatStreamError,
  getChatModelFallbackChain,
  isAnthropicOverloadError,
} from '@/lib/ai/chat-errors'

describe('isAnthropicOverloadError', () => {
  it('detects overloaded_error on stream chunk', () => {
    expect(
      isAnthropicOverloadError({
        type: 'overloaded_error',
        message: 'Overloaded',
      })
    ).toBe(true)
  })

  it('detects nested overloaded_error', () => {
    expect(
      isAnthropicOverloadError({
        error: { type: 'overloaded_error', message: 'Overloaded' },
      })
    ).toBe(true)
  })
})

describe('getChatModelFallbackChain', () => {
  it('falls back opus to sonnet then haiku', () => {
    expect(getChatModelFallbackChain('claude-opus-4-5')).toEqual([
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-haiku-4-5',
    ])
  })
})

describe('formatChatStreamError', () => {
  it('returns Vietnamese overload message for opus', () => {
    const msg = formatChatStreamError(
      { type: 'overloaded_error', message: 'Overloaded' },
      'claude-opus-4-5'
    )
    expect(msg).toContain('Opus')
    expect(msg).toContain('quá tải')
  })
})

describe('buildModelFallbackNotice', () => {
  it('describes automatic fallback', () => {
    const notice = buildModelFallbackNotice('claude-opus-4-5', 'claude-sonnet-4-5')
    expect(notice).toContain('Opus')
    expect(notice).toContain('Sonnet')
  })
})
