import { describe, it, expect } from 'vitest'
import { detectAndValidateFileType } from './validate-file'

describe('detectAndValidateFileType', () => {
  it('accepts valid PDF', () => {
    const buf = Buffer.from('%PDF-1.4 test content')
    const result = detectAndValidateFileType('doc.pdf', buf)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fileType).toBe('pdf')
  })

  it('accepts valid DOCX', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
    const result = detectAndValidateFileType('file.docx', buf)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fileType).toBe('docx')
  })

  it('accepts audio/video as storage-only types', () => {
    const buf = Buffer.from('fake')
    const result = detectAndValidateFileType('song.mp3', buf)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fileType).toBe('mp3')
  })

  it('accepts images', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const result = detectAndValidateFileType('photo.png', buf)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fileType).toBe('png')
  })

  it('rejects extension mismatch', () => {
    const buf = Buffer.from('%PDF-1.4')
    const result = detectAndValidateFileType('file.docx', buf)
    expect(result.ok).toBe(false)
  })

  it('accepts plain text', () => {
    const buf = Buffer.from('Hello world content')
    const result = detectAndValidateFileType('notes.txt', buf)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fileType).toBe('txt')
  })
})
