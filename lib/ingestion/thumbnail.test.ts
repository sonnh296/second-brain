import { describe, it, expect } from 'vitest'
import { documentThumbnailKey, renderImageThumbnail, THUMB_MAX_PX } from './thumbnail'

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

describe('documentThumbnailKey', () => {
  it('uses a stable per-document JPEG key', () => {
    expect(documentThumbnailKey('user-1', 'doc-2')).toBe('user-1/doc-2/thumb.jpg')
  })
})

describe('renderImageThumbnail', () => {
  it('returns a JPEG smaller than the max edge', async () => {
    const out = await renderImageThumbnail(ONE_PX_PNG)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8)
    expect(out.length).toBeLessThan(20_000)
    expect(THUMB_MAX_PX).toBe(360)
  })
})
