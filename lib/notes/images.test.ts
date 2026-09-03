import { describe, expect, it } from 'vitest'
import { listNoteImageRefs, noteImageR2Key, parseNoteImageSrc } from './images'

describe('note image helpers', () => {
  it('parses note image src', () => {
    const parsed = parseNoteImageSrc(
      '/api/notes/images/n/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.png'
    )
    expect(parsed).toEqual({
      kind: 'n',
      scopeId: '11111111-1111-1111-1111-111111111111',
      filename: '22222222-2222-2222-2222-222222222222.png',
    })
  })

  it('lists markdown image refs', () => {
    const md = [
      'Hello',
      '![slide](/api/notes/images/d/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg)',
      'tail',
    ].join('\n')
    expect(listNoteImageRefs(md)).toEqual([
      {
        alt: 'slide',
        kind: 'd',
        scopeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        filename: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg',
      },
    ])
  })

  it('builds r2 keys', () => {
    expect(
      noteImageR2Key('user', 'n', 'note-id', 'img.png')
    ).toBe('notes/user/n/note-id/img.png')
  })
})
