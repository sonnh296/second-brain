import { describe, expect, it } from 'vitest'
import { rangeSelectIds } from './selection'

describe('rangeSelectIds', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']

  it('selects inclusive range from anchor to target', () => {
    expect(rangeSelectIds(ids, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeSelectIds(ids, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('falls back to the clicked item when the list has no anchor', () => {
    expect(rangeSelectIds(ids, null, 'c')).toEqual(['c'])
    expect(rangeSelectIds(ids, 'missing', 'c')).toEqual(['c'])
  })

  it('selects a single item when clicking the anchor', () => {
    expect(rangeSelectIds(ids, 'c', 'c')).toEqual(['c'])
  })
})
