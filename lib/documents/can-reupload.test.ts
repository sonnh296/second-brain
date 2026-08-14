import { describe, expect, it } from 'vitest'
import { OCR_WEAK_CONTENT_MESSAGE } from '@/lib/ingestion/ocr-status'
import { canReuploadDocument } from '@/lib/documents/can-reupload'

describe('canReuploadDocument', () => {
  it('allows failed non-note files', () => {
    expect(canReuploadDocument({ status: 'failed', file_type: 'png' })).toBe(true)
    expect(canReuploadDocument({ status: 'failed', file_type: 'mp4' })).toBe(true)
  })

  it('blocks notes', () => {
    expect(canReuploadDocument({ status: 'failed', file_type: 'note' })).toBe(false)
  })

  it('allows images kept after weak OCR', () => {
    expect(
      canReuploadDocument({
        status: 'done',
        file_type: 'jpg',
        error_message: OCR_WEAK_CONTENT_MESSAGE,
      })
    ).toBe(true)
  })

  it('does not allow successful files without the weak-OCR warning', () => {
    expect(canReuploadDocument({ status: 'done', file_type: 'png' })).toBe(false)
    expect(canReuploadDocument({ status: 'processing', file_type: 'png' })).toBe(false)
  })
})
