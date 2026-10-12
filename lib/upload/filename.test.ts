import { describe, expect, it } from 'vitest'
import { filenameStem, splitFilename } from './filename'

describe('splitFilename', () => {
  it('splits stem and extension', () => {
    expect(splitFilename('report.final.pdf')).toEqual({
      base: 'report.final',
      ext: '.pdf',
    })
  })

  it('keeps dotfiles as base', () => {
    expect(splitFilename('.env')).toEqual({ base: '.env', ext: '' })
  })
})

describe('filenameStem', () => {
  it('keeps locked ext when stem is cleared', () => {
    expect(filenameStem('.pdf', '.pdf')).toBe('')
  })

  it('returns stem when name still has locked ext', () => {
    expect(filenameStem('bài tập.pdf', '.pdf')).toBe('bài tập')
  })

  it('allows spaces in stem', () => {
    expect(filenameStem('my file.pdf', '.pdf')).toBe('my file')
  })
})
