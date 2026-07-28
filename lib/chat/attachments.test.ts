import { describe, expect, it } from 'vitest'
import { chatAttachmentKey } from '@/lib/storage'
import { HISTORY_IMAGE_CAP } from '@/lib/chat/attachments'

describe('chatAttachmentKey', () => {
  it('builds stable R2 path', () => {
    expect(chatAttachmentKey('user-1', 'sess-2', 'att-3', 'png')).toBe(
      'chat/user-1/sess-2/att-3.png'
    )
  })
})

describe('HISTORY_IMAGE_CAP', () => {
  it('defaults to 4 for cost control', () => {
    expect(HISTORY_IMAGE_CAP).toBe(4)
  })
})
