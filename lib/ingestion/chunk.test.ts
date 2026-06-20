import { describe, it, expect } from 'vitest'
import { chunkText } from './chunk'

describe('chunkText', () => {
  it('returns empty for blank input', () => {
    expect(chunkText('   ')).toEqual([])
  })

  it('returns single chunk for short text', () => {
    const chunks = chunkText('Short paragraph of text.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].index).toBe(0)
  })

  it('splits long text into multiple chunks with indices', () => {
    const long = 'Word '.repeat(2000)
    const chunks = chunkText(long)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].index).toBe(0)
    expect(chunks[1].index).toBe(1)
  })

  it('prefers paragraph breaks', () => {
    const para1 = 'A'.repeat(2000)
    const para2 = 'B'.repeat(2000)
    const text = `${para1}\n\n${para2}`
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })
})
