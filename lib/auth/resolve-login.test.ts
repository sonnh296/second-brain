import { describe, it, expect } from 'vitest'
import { looksLikeEmail } from './resolve-login'

describe('looksLikeEmail', () => {
  it('accepts valid emails', () => {
    expect(looksLikeEmail('user@example.com')).toBe(true)
    expect(looksLikeEmail('son29062002@gmail.com')).toBe(true)
  })

  it('rejects usernames without @', () => {
    expect(looksLikeEmail('username')).toBe(false)
    expect(looksLikeEmail('user@')).toBe(false)
  })
})
