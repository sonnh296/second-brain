import { describe, it, expect } from 'vitest'
import {
  isGreeting,
  isDocumentInventoryQuery,
  extractSearchKeywords,
} from '../ai/query-intent'

describe('query-intent', () => {
  it('detects greetings', () => {
    expect(isGreeting('xin chào')).toBe(true)
    expect(isGreeting('Hello!')).toBe(true)
    expect(isGreeting('tôi có ielts không')).toBe(false)
  })

  it('detects inventory questions', () => {
    expect(isDocumentInventoryQuery('tôi có tài liệu ielts nào không')).toBe(true)
    expect(isDocumentInventoryQuery('liệt kê tài liệu đã upload')).toBe(true)
    expect(isDocumentInventoryQuery('ielts writing task 2')).toBe(false)
  })

  it('extracts keywords', () => {
    expect(extractSearchKeywords('tôi có tài liệu ielts nào không')).toContain('ielts')
  })
})
