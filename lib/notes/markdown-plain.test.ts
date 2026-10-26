import { describe, it, expect } from 'vitest'
import { markdownToPlainText } from './markdown-plain'

describe('markdownToPlainText', () => {
  it('strips common markdown markers', () => {
    expect(
      markdownToPlainText('## Tiêu đề\n\n**đậm** và *nghiêng*\n\n- mục 1\n\n[link](https://x.com)')
    ).toBe('Tiêu đề\n\nđậm và nghiêng\nmục 1\n\nlink')
  })

  it('returns empty for blank input', () => {
    expect(markdownToPlainText('')).toBe('')
  })
})
