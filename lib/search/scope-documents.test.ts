import { describe, expect, it, vi } from 'vitest'
import { hasDocumentScope, resolveDocumentScope } from './scope-documents'

describe('hasDocumentScope', () => {
  it('is false when no filters', () => {
    expect(hasDocumentScope()).toBe(false)
    expect(hasDocumentScope({})).toBe(false)
    expect(hasDocumentScope({ tagIds: [] })).toBe(false)
  })

  it('is true when tags or folder set', () => {
    expect(hasDocumentScope({ tagIds: ['a'] })).toBe(true)
    expect(hasDocumentScope({ folderId: 'folder-1' })).toBe(true)
  })
})

describe('resolveDocumentScope', () => {
  it('returns inactive when no filters', async () => {
    const supabase = { from: vi.fn() }
    const result = await resolveDocumentScope(supabase as never, 'user-1', {})
    expect(result).toEqual({ active: false })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns empty active scope when tags match no documents', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'document_tags') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [], error: null }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }

    const result = await resolveDocumentScope(supabase as never, 'user-1', {
      tagIds: ['tag-1'],
    })
    expect(result).toEqual({ active: true, documentIds: [] })
  })

  it('intersects tag docs with done documents', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'document_tags') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({
                  data: [{ document_id: 'doc-1' }, { document_id: 'doc-2' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'documents') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    in: async () => ({
                      data: [{ id: 'doc-1' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }

    const result = await resolveDocumentScope(supabase as never, 'user-1', {
      tagIds: ['tag-1'],
    })
    expect(result).toEqual({ active: true, documentIds: ['doc-1'] })
  })
})
