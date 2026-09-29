import { describe, it, expect } from 'vitest'
import {
  isFollowUpMessage,
  looksLikeNewTopic,
  resolveFollowUpRetrieval,
  fallbackCitationsFromSources,
} from './follow-up'

describe('isFollowUpMessage', () => {
  it('detects Vietnamese link follow-ups', () => {
    expect(isFollowUpMessage('cho tôi link nữa')).toBe(true)
    expect(isFollowUpMessage('xem chi tiết')).toBe(true)
    expect(isFollowUpMessage('mở file đó')).toBe(true)
  })

  it('does not treat a full new question as follow-up', () => {
    expect(
      isFollowUpMessage('Lịch học môn lập trình C thế nào bạn')
    ).toBe(false)
  })
})

describe('looksLikeNewTopic', () => {
  it('detects topic switch', () => {
    expect(
      looksLikeNewTopic(
        'modbus tcp cấu hình như thế nào trên PLC',
        'Lịch học môn lập trình C thế nào'
      )
    ).toBe(true)
  })

  it('does not treat link follow-up as new topic', () => {
    expect(
      looksLikeNewTopic('cho tôi link nữa', 'Lịch học môn lập trình C thế nào')
    ).toBe(false)
  })
})

describe('resolveFollowUpRetrieval', () => {
  const history = [
    { role: 'user', content: 'Lịch học môn lập trình C thế nào' },
    {
      role: 'assistant',
      content: 'Đây là lịch 工程训练C…',
      cited_sources: [
        {
          filename: 'Lịch đi học môn C',
          chunk_index: 0,
          document_id: 'doc-lich',
          file_type: 'png',
        },
      ],
    },
  ]

  it('pins prior cited docs for short link follow-up', () => {
    const r = resolveFollowUpRetrieval('cho tôi link nữa', history)
    expect(r.isFollowUp).toBe(true)
    expect(r.stickyDocumentIds).toEqual(['doc-lich'])
    expect(r.searchQuery).toContain('Lịch đi học môn C')
    expect(r.searchQuery).toContain('cho tôi link nữa')
  })

  it('does not sticky when user switches topic', () => {
    const r = resolveFollowUpRetrieval(
      'modbus tcp cấu hình như thế nào trên PLC licos',
      history
    )
    expect(r.isFollowUp).toBe(false)
    expect(r.stickyDocumentIds).toEqual([])
    expect(r.searchQuery).toBe('modbus tcp cấu hình như thế nào trên PLC licos')
  })
})

describe('fallbackCitationsFromSources', () => {
  const sources = [
    {
      filename: 'Lịch đi học môn C',
      chunk_index: 0,
      score: 0.9,
      document_id: 'a',
      file_type: 'png',
    },
    {
      filename: 'Các trang web',
      chunk_index: 0,
      score: 0.5,
      document_id: 'b',
      file_type: 'note',
    },
  ]

  it('prefers filenames mentioned in the answer', () => {
    const cites = fallbackCitationsFromSources(
      'Theo file Lịch đi học môn C thì giờ học là…',
      sources
    )
    expect(cites).toHaveLength(1)
    expect(cites[0].document_id).toBe('a')
  })

  it('falls back to top scores when no filename mentioned', () => {
    const cites = fallbackCitationsFromSources('Thời gian học là chiều thứ 2.', sources, {
      maxFiles: 1,
    })
    expect(cites[0].document_id).toBe('a')
  })
})
