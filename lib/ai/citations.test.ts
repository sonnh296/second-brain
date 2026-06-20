import { describe, it, expect } from 'vitest'
import { parseCitationsFromResponse } from './citations'

const sources = [
  {
    filename: 'vietnam-startup-ecosystem.txt',
    chunk_index: 0,
    chunk_text: 'VNG content',
    score: 0.9,
  },
  {
    filename: 'other.pdf',
    chunk_index: 3,
    chunk_text: 'Other content',
    score: 0.7,
  },
]

describe('parseCitationsFromResponse', () => {
  it('parses citation block and strips from content', () => {
    const text =
      'Answer here.\n\n<!--CITATIONS:["vietnam-startup-ecosystem.txt:0"]-->'
    const { content, citedSources } = parseCitationsFromResponse(text, sources)
    expect(content).toBe('Answer here.')
    expect(citedSources).toEqual([
      { filename: 'vietnam-startup-ecosystem.txt', chunk_index: 0 },
    ])
  })

  it('falls back to top scored sources when block missing', () => {
    const { content, citedSources } = parseCitationsFromResponse(
      'No citation block',
      sources
    )
    expect(content).toBe('No citation block')
    expect(citedSources.length).toBeGreaterThan(0)
    expect(citedSources[0].filename).toBe('vietnam-startup-ecosystem.txt')
  })
})
