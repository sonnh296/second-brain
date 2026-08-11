import { describe, it, expect } from 'vitest'
import { filterRelevantChunks } from './relevance-filter'
import type { SearchResult } from '../vector'

function chunk(score: number): SearchResult {
  return {
    point_id: '1',
    score,
    payload: {
      user_id: 'u',
      document_id: 'd',
      filename: 'test.pdf',
      chunk_index: 0,
      chunk_text: 'ielts',
    },
  }
}

describe('filterRelevantChunks', () => {
  it('keeps chunks above threshold', () => {
    const result = filterRelevantChunks([chunk(0.2), chunk(0.05)])
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0.2)
  })

  it('falls back to top-N when all scores are low', () => {
    const result = filterRelevantChunks([chunk(0.126), chunk(0.115), chunk(0.09), chunk(0.08)])
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].score).toBe(0.126)
  })

  it('keeps filename matches even below the score threshold', () => {
    const named: SearchResult = {
      point_id: 'fn',
      score: 0.05,
      payload: {
        user_id: 'u',
        document_id: 'word',
        filename: 'leishine.docx',
        chunk_index: 0,
        chunk_text: '雷赛',
        matched_by_filename: true,
      },
    }
    const result = filterRelevantChunks([named, chunk(0.05)])
    expect(result.some((r) => r.payload.document_id === 'word')).toBe(true)
  })
})
