import { describe, it, expect } from 'vitest'
import { dedupeCitedSourcesByFile, parseCitationsFromResponse } from './citations'

const sources = [
  {
    filename: 'vietnam-startup-ecosystem.txt',
    chunk_index: 0,
    chunk_text: 'VNG content',
    score: 0.9,
    document_id: 'doc-1',
    file_type: 'txt',
  },
  {
    filename: 'other.pdf',
    chunk_index: 3,
    chunk_text: 'Other content',
    score: 0.7,
    document_id: 'doc-2',
    file_type: 'pdf',
    page: 4,
  },
]

describe('parseCitationsFromResponse', () => {
  it('parses citation block and strips from content', () => {
    const text =
      'Answer here.\n\n<!--CITATIONS:["vietnam-startup-ecosystem.txt:0"]-->'
    const { content, citedSources } = parseCitationsFromResponse(text, sources)
    expect(content).toBe('Answer here.')
    expect(citedSources).toEqual([
      {
        filename: 'vietnam-startup-ecosystem.txt',
        chunk_index: 0,
        document_id: 'doc-1',
        file_type: 'txt',
        page: undefined,
      },
    ])
  })

  it('returns empty citations when block missing (no silent fallback)', () => {
    const { content, citedSources } = parseCitationsFromResponse(
      'No citation block',
      sources
    )
    expect(content).toBe('No citation block')
    expect(citedSources).toEqual([])
  })

  it('returns empty citations when JSON is malformed', () => {
    const text = 'Answer.\n\n<!--CITATIONS:[not-json]-->'
    const { content, citedSources } = parseCitationsFromResponse(text, sources)
    expect(content).toBe('Answer.')
    expect(citedSources).toEqual([])
  })

  it('ignores refs that do not match available sources', () => {
    const text = 'Answer.\n\n<!--CITATIONS:["missing.txt:0","other.pdf:3"]-->'
    const { citedSources } = parseCitationsFromResponse(text, sources)
    expect(citedSources).toEqual([
      {
        filename: 'other.pdf',
        chunk_index: 3,
        document_id: 'doc-2',
        file_type: 'pdf',
        page: 4,
      },
    ])
  })

  it('dedupes multiple chunks from the same file', () => {
    const multiChunk = [
      ...sources,
      {
        filename: 'vietnam-startup-ecosystem.txt',
        chunk_index: 2,
        chunk_text: 'More VNG',
        score: 0.8,
        document_id: 'doc-1',
        file_type: 'txt',
      },
    ]
    const text =
      'Answer.\n\n<!--CITATIONS:["vietnam-startup-ecosystem.txt:0","vietnam-startup-ecosystem.txt:2","other.pdf:3"]-->'
    const { citedSources } = parseCitationsFromResponse(text, multiChunk)
    expect(citedSources).toEqual([
      {
        filename: 'vietnam-startup-ecosystem.txt',
        chunk_index: 0,
        document_id: 'doc-1',
        file_type: 'txt',
        page: undefined,
      },
      {
        filename: 'other.pdf',
        chunk_index: 3,
        document_id: 'doc-2',
        file_type: 'pdf',
        page: 4,
      },
    ])
  })
})

describe('dedupeCitedSourcesByFile', () => {
  it('keeps one source per document_id', () => {
    expect(
      dedupeCitedSourcesByFile([
        { filename: 'a.docx', chunk_index: 0, document_id: 'd1', file_type: 'docx' },
        { filename: 'a.docx', chunk_index: 4, document_id: 'd1', file_type: 'docx' },
        { filename: 'b.pdf', chunk_index: 1, document_id: 'd2', file_type: 'pdf', page: 2 },
      ])
    ).toEqual([
      { filename: 'a.docx', chunk_index: 0, document_id: 'd1', file_type: 'docx' },
      { filename: 'b.pdf', chunk_index: 1, document_id: 'd2', file_type: 'pdf', page: 2 },
    ])
  })
})
