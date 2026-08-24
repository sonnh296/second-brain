import { describe, it, expect } from 'vitest'
import { buildDocumentViewerUrl } from './viewer-url'

describe('buildDocumentViewerUrl', () => {
  it('builds base viewer path', () => {
    expect(buildDocumentViewerUrl('abc-123')).toBe('/documents/abc-123/view')
  })

  it('adds page, tab, and from=chat query params', () => {
    expect(
      buildDocumentViewerUrl('abc-123', {
        page: 4,
        tab: 'subtitles',
        fromChat: true,
      })
    ).toBe('/documents/abc-123/view?page=4&tab=subtitles&from=chat')
  })

  it('ignores invalid page numbers', () => {
    expect(buildDocumentViewerUrl('abc-123', { page: 0 })).toBe('/documents/abc-123/view')
  })
})
