import { describe, it, expect } from 'vitest'
import {
  isGreeting,
  isDocumentInventoryQuery,
  isDocumentManagementQuery,
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

  it('detects document management intents', () => {
    expect(isDocumentManagementQuery('đổi tên file thành abc')).toBe(true)
    expect(isDocumentManagementQuery('đổi tên báo cáo.pdf thành abc')).toBe(true)
    expect(isDocumentManagementQuery('rename this document to notes')).toBe(true)
    expect(isDocumentManagementQuery('di chuyển file vào thư mục Công việc')).toBe(true)
    expect(isDocumentManagementQuery('gắn tag quan trọng cho file này')).toBe(true)
    expect(isDocumentManagementQuery('tạo ghi chú họp ngày mai')).toBe(true)
    expect(isDocumentManagementQuery('tóm tắt nội dung ielts')).toBe(false)
  })

  it('extracts keywords', () => {
    expect(extractSearchKeywords('tôi có tài liệu ielts nào không')).toContain('ielts')
    expect(extractSearchKeywords('雷赛 PLC')).toEqual(expect.arrayContaining(['雷赛', 'plc']))
  })
})
