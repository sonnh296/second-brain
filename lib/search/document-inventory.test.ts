import { describe, expect, it, vi } from 'vitest'

vi.mock('../ai/query-intent', () => ({
  isDocumentInventoryQuery: () => true,
  extractSearchKeywords: () => ['pdf'],
}))

import { searchDocumentInventory } from './document-inventory'

describe('searchDocumentInventory', () => {
  it('includes document_id and file_type on matched sources', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                order: async () => ({
                  data: [
                    {
                      id: 'doc-1',
                      filename: 'report.pdf',
                      description: null,
                      file_type: 'pdf',
                      chunk_count: 3,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }

    const sources = await searchDocumentInventory(supabase as never, 'user-1', 'có pdf không')
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      filename: 'report.pdf',
      document_id: 'doc-1',
      file_type: 'pdf',
      chunk_index: 0,
    })
  })
})
