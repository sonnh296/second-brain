import { describe, it, expect } from 'vitest'
import {
  MAX_FILE_SIZE_BYTES,
  MAX_STORAGE_BYTES_PER_USER,
  sanitizeFilename,
  quotaStatusCode,
} from './upload-limits'

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('folder\\file.txt')).toBe('file.txt')
  })

  it('truncates long names', () => {
    const long = 'a'.repeat(300)
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200)
  })
})

describe('quotaStatusCode', () => {
  it('returns 413 for file size', () => {
    expect(quotaStatusCode({ code: 'file_size', message: 'x' })).toBe(413)
  })

  it('returns 403 for storage and doc limit', () => {
    expect(quotaStatusCode({ code: 'storage', message: 'x' })).toBe(403)
    expect(quotaStatusCode({ code: 'doc_limit', message: 'x' })).toBe(403)
  })
})

describe('limits constants', () => {
  it('has sensible defaults', () => {
    expect(MAX_FILE_SIZE_BYTES).toBeGreaterThan(0)
    expect(MAX_STORAGE_BYTES_PER_USER).toBeGreaterThan(MAX_FILE_SIZE_BYTES)
  })
})
