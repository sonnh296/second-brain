import { describe, expect, it } from 'vitest'
import { isDocumentInventoryQuery } from './query-intent'

describe('isDocumentInventoryQuery', () => {
  it('matches "tài liệu của tôi có gì"', () => {
    expect(isDocumentInventoryQuery('tài liệu của tôi có gì')).toBe(true)
  })

  it('matches list-style questions', () => {
    expect(isDocumentInventoryQuery('liệt kê tài liệu')).toBe(true)
    expect(isDocumentInventoryQuery('có file pdf không')).toBe(true)
  })

  it('does not match content questions', () => {
    expect(isDocumentInventoryQuery('tóm tắt hợp đồng bảo hiểm')).toBe(false)
  })
})
