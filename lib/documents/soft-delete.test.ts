import { describe, it, expect, vi, beforeEach } from 'vitest'

const deleteByDocument = vi.fn()
vi.mock('@/lib/vector', () => ({
  deleteByDocument: (...args: unknown[]) => deleteByDocument(...args),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { softDeleteDocument } from './soft-delete'

function mockSupabase(opts: {
  doc: { id: string; deleted_at: string | null } | null
  updateError?: unknown
  chunkError?: unknown
}) {
  const single = vi.fn().mockResolvedValue({ data: opts.doc, error: null })
  const selectEq2 = vi.fn(() => ({ single }))
  const selectEq1 = vi.fn(() => ({ eq: selectEq2 }))
  const select = vi.fn(() => ({ eq: selectEq1 }))

  const updateEq2 = vi.fn().mockResolvedValue({ error: opts.updateError ?? null })
  const updateEq1 = vi.fn(() => ({ eq: updateEq2 }))
  const update = vi.fn(() => ({ eq: updateEq1 }))

  const chunkEq2 = vi.fn().mockResolvedValue({ error: opts.chunkError ?? null })
  const chunkEq1 = vi.fn(() => ({ eq: chunkEq2 }))
  const chunkDelete = vi.fn(() => ({ eq: chunkEq1 }))

  return {
    from: vi.fn((table: string) => {
      if (table === 'document_chunks') {
        return { delete: chunkDelete }
      }
      return { select, update }
    }),
    _spies: { update, chunkDelete, select },
  }
}

describe('softDeleteDocument', () => {
  beforeEach(() => {
    deleteByDocument.mockReset()
    deleteByDocument.mockResolvedValue(undefined)
  })

  it('returns 404 when document missing', async () => {
    const supabase = mockSupabase({ doc: null })
    const result = await softDeleteDocument(supabase as never, 'user-1', 'doc-1')
    expect(result).toEqual({ ok: false, error: 'Document not found', status: 404 })
    expect(deleteByDocument).not.toHaveBeenCalled()
  })

  it('is idempotent when already in trash', async () => {
    const supabase = mockSupabase({
      doc: { id: 'doc-1', deleted_at: '2026-01-01T00:00:00Z' },
    })
    const result = await softDeleteDocument(supabase as never, 'user-1', 'doc-1')
    expect(result).toEqual({ ok: true, already_trashed: true })
    expect(deleteByDocument).not.toHaveBeenCalled()
  })

  it('sets deleted_at and removes search indexes', async () => {
    const supabase = mockSupabase({
      doc: { id: 'doc-1', deleted_at: null },
    })
    const result = await softDeleteDocument(supabase as never, 'user-1', 'doc-1')
    expect(result).toEqual({ ok: true })
    expect(supabase._spies.update).toHaveBeenCalled()
    expect(deleteByDocument).toHaveBeenCalledWith('user-1', 'doc-1')
    expect(supabase._spies.chunkDelete).toHaveBeenCalled()
  })
})
