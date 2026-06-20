import { describe, it, expect } from 'vitest'
import { isRelevantChunk, scoreCase, summarizeEval } from './retrieval-metrics'

describe('retrieval-metrics', () => {
  const chunk = {
    filename: 'vietnam-startup-ecosystem.txt',
    chunk_text: 'Việt Nam có 6 unicorn',
    chunk_index: 0,
    document_id: 'doc-1',
    score: 0.9,
  }

  it('matches by expected filename', () => {
    expect(
      isRelevantChunk(chunk, {
        question: 'q',
        expected_filenames: ['vietnam-startup'],
      })
    ).toBe(true)
  })

  it('matches by expected term', () => {
    expect(
      isRelevantChunk(chunk, {
        question: 'q',
        expected_terms: ['unicorn'],
      })
    ).toBe(true)
  })

  it('computes precision@k and MRR', () => {
    const summary = summarizeEval(
      [{ question: 'unicorn?', expected_terms: ['unicorn'] }],
      [[chunk, { ...chunk, chunk_text: 'noise', filename: 'other.txt' }]],
      2
    )
    expect(summary.hit_at_k).toBe(1)
    expect(summary.mean_precision_at_k).toBe(0.5)
    expect(summary.mrr).toBe(1)
    expect(scoreCase({ question: 'x', expected_terms: ['missing'] }, [chunk], 1).hit_at_k).toBe(
      false
    )
  })
})
