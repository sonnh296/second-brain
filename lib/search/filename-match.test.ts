import { describe, it, expect } from 'vitest'
import {
  extractFilenameKeywords,
  scoreFilenameHaystack,
  mergeFilenameMatches,
  selectContextChunks,
  estimateTokens,
  type ContextChunk,
} from './filename-match'
import type { SearchResult } from '../vector'

function result(
  documentId: string,
  chunkIndex: number,
  opts: Partial<SearchResult['payload']> & { score?: number } = {}
): SearchResult {
  const { score = 0.3, ...payload } = opts
  return {
    point_id: `${documentId}:${chunkIndex}`,
    score,
    payload: {
      user_id: 'u',
      document_id: documentId,
      filename: payload.filename ?? `${documentId}.txt`,
      chunk_index: chunkIndex,
      chunk_text: payload.chunk_text ?? 'text',
      ...payload,
    },
  }
}

function ctx(
  documentId: string,
  chunkIndex: number,
  opts: Partial<ContextChunk> = {}
): ContextChunk {
  return {
    document_id: documentId,
    chunk_index: chunkIndex,
    chunk_text: opts.chunk_text ?? 'x'.repeat(40),
    score: opts.score ?? 0.3,
    matched_by_filename: opts.matched_by_filename,
    filename_match_strong: opts.filename_match_strong,
  }
}

describe('extractFilenameKeywords', () => {
  it('keeps brand tokens from a long Vietnamese question', () => {
    const keys = extractFilenameKeywords(
      'Gạch đầu dòng ra đây xem là so sánh với leishine với licos thì so sánh những mục gì'
    )
    expect(keys).toContain('leishine')
    expect(keys).toContain('licos')
  })

  it('keeps short distinctive codes like vcx', () => {
    expect(extractFilenameKeywords('có tài liệu gì liên quan đến vcx không')).toContain('vcx')
  })

  it('drops generic summarize-file phrasing', () => {
    expect(extractFilenameKeywords('tóm tắt file word')).toEqual([])
  })
})

describe('scoreFilenameHaystack', () => {
  it('strongly matches leishine/licos in the Word filename', () => {
    const s = scoreFilenameHaystack(
      'So sánh thiết bị giữa leishine với cả licos.',
      null,
      ['leishine', 'licos']
    )
    expect(s.hits).toBe(2)
    expect(s.strong).toBe(true)
    expect(s.score).toBeGreaterThan(0)
  })

  it('matches vcx in att-vcx filename', () => {
    const s = scoreFilenameHaystack('att-vcx (2).docx', 'an toàn thông tin', ['vcx'])
    expect(s.hits).toBe(1)
    expect(s.score).toBeGreaterThan(0)
  })
})

describe('mergeFilenameMatches', () => {
  it('prepends filename hits ahead of vector results', () => {
    const fused = [result('servo', 0, { score: 0.33 }), result('word', 12, { score: 0.25 })]
    const filename = [
      result('word', 0, { score: 1, matched_by_filename: true, filename_match_strong: true }),
    ]
    const merged = mergeFilenameMatches(fused, filename, 20)
    expect(merged[0].payload.document_id).toBe('word')
    expect(merged[0].payload.chunk_index).toBe(0)
    expect(merged.some((r) => r.payload.document_id === 'word' && r.payload.chunk_index === 12)).toBe(
      true
    )
  })
})

describe('selectContextChunks', () => {
  it('pins a strong filename match and fills with more chunks from that file', () => {
    const chunks: ContextChunk[] = [
      ctx('word', 0, { matched_by_filename: true, filename_match_strong: true, score: 1 }),
      ctx('word', 1, { matched_by_filename: true, filename_match_strong: true, score: 1 }),
      ctx('servo', 0, { score: 0.33 }),
      ctx('servo', 1, { score: 0.32 }),
      ctx('video', 0, { score: 0.31 }),
      ctx('note', 0, { score: 0.3 }),
      ctx('word', 12, { score: 0.26 }),
      ctx('word', 13, { score: 0.25 }),
      ctx('word', 17, { score: 0.24 }),
    ]

    const selected = selectContextChunks(chunks, {
      minChunks: 3,
      defaultChunks: 5,
      maxChunks: 8,
      tokenBudget: 8000,
    })

    expect(selected[0].document_id).toBe('word')
    expect(selected.filter((c) => c.document_id === 'word').length).toBeGreaterThanOrEqual(3)
    expect(selected.length).toBeGreaterThanOrEqual(3)
    expect(selected.length).toBeLessThanOrEqual(8)
  })

  it('does not let one unrelated file take every slot', () => {
    const chunks: ContextChunk[] = [
      ctx('a', 0, { score: 0.4 }),
      ctx('a', 1, { score: 0.39 }),
      ctx('a', 2, { score: 0.38 }),
      ctx('a', 3, { score: 0.37 }),
      ctx('a', 4, { score: 0.36 }),
      ctx('b', 0, { score: 0.35 }),
      ctx('c', 0, { score: 0.34 }),
    ]
    const selected = selectContextChunks(chunks, {
      minChunks: 3,
      defaultChunks: 5,
      maxChunks: 8,
    })
    const docs = new Set(selected.map((c) => c.document_id))
    expect(docs.size).toBeGreaterThan(1)
  })

  it('expands past 5 when extra scores stay close', () => {
    const chunks: ContextChunk[] = Array.from({ length: 8 }, (_, i) =>
      ctx(`d${i}`, 0, { score: 0.4 - i * 0.005, chunk_text: 'short' })
    )
    const selected = selectContextChunks(chunks, {
      minChunks: 3,
      defaultChunks: 5,
      maxChunks: 8,
      scoreKeepRatio: 0.8,
      tokenBudget: 8000,
    })
    expect(selected.length).toBeGreaterThan(5)
    expect(selected.length).toBeLessThanOrEqual(8)
  })

  it('respects token budget after the minimum', () => {
    const huge = '字'.repeat(6000)
    const chunks: ContextChunk[] = [
      ctx('a', 0, { chunk_text: huge, score: 0.5 }),
      ctx('b', 0, { chunk_text: huge, score: 0.49 }),
      ctx('c', 0, { chunk_text: huge, score: 0.48 }),
      ctx('d', 0, { chunk_text: huge, score: 0.47 }),
    ]
    const selected = selectContextChunks(chunks, {
      minChunks: 1,
      defaultChunks: 5,
      maxChunks: 8,
      tokenBudget: 5000,
    })
    expect(selected.length).toBeLessThan(4)
    expect(selected.length).toBeGreaterThanOrEqual(1)
  })
})

describe('estimateTokens', () => {
  it('counts CJK as denser than Latin', () => {
    expect(estimateTokens('雷赛'.repeat(100))).toBeGreaterThan(estimateTokens('ab'.repeat(100)))
  })
})
