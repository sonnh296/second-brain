import { describe, it, expect } from 'vitest'
import {
  citationsFromLibraryDocs,
  dedupeCitedSourcesByFile,
  extractFilenamesFromText,
  parseCitationsFromResponse,
} from './citations'

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

  it('returns empty citations when block missing (caller may soft-fallback)', () => {
    const { content, citedSources } = parseCitationsFromResponse(
      'No citation block',
      sources
    )
    expect(content).toBe('No citation block')
    expect(citedSources).toEqual([])
  })

  it('accepts optional whitespace in the CITATIONS marker', () => {
    const text =
      'Answer here.\n\n<!-- CITATIONS: ["vietnam-startup-ecosystem.txt:0"] -->'
    const { content, citedSources } = parseCitationsFromResponse(text, sources)
    expect(content).toBe('Answer here.')
    expect(citedSources).toHaveLength(1)
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

describe('extractFilenamesFromText', () => {
  it('extracts video filenames from prose without swallowing surrounding words', () => {
    const text =
      'Mình tìm thấy video `01092026lehieulan5.mp4` trong kho. Không liên quan ảnh khác.'
    expect(extractFilenamesFromText(text)).toEqual(['01092026lehieulan5.mp4'])
  })
})

describe('citationsFromLibraryDocs', () => {
  it('cites the video named in the answer, not unrelated retrieval noise', () => {
    const cites = citationsFromLibraryDocs(
      'Mình tìm thấy file 01092026lehieulan5.mp4 trong kho lưu trữ.',
      [
        { id: 'img-1', filename: 'Weixin Image_202608291.png', file_type: 'png' },
        { id: 'vid-1', filename: '01092026lehieulan5.mp4', file_type: 'mp4' },
        { id: 'pdf-1', filename: 'Giải thích Modbus Memory.pdf', file_type: 'pdf' },
      ]
    )
    expect(cites).toEqual([
      {
        filename: '01092026lehieulan5.mp4',
        chunk_index: 0,
        document_id: 'vid-1',
        file_type: 'mp4',
      },
    ])
  })
})
