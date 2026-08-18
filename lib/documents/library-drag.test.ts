import { describe, expect, it } from 'vitest'
import { beginLibraryDocDrag, endLibraryDocDrag, isLibraryDocDrag, readLibraryDocIds } from './library-drag'

function fakeDataTransfer(initialTypes: string[] = []) {
  const store = new Map<string, string>()
  const types = [...initialTypes]
  return {
    types,
    effectAllowed: 'none' as string,
    setData(type: string, value: string) {
      store.set(type, value)
      if (!types.includes(type)) types.push(type)
    },
    getData(type: string) {
      return store.get(type) ?? ''
    },
  } as unknown as DataTransfer
}

describe('library-drag', () => {
  it('keeps ids in memory so drop still works when getData is empty', () => {
    const dt = fakeDataTransfer()
    beginLibraryDocDrag(['doc-1', 'doc-2'], dt)
    expect(isLibraryDocDrag(dt)).toBe(true)
    expect(readLibraryDocIds(dt)).toEqual(['doc-1', 'doc-2'])
    endLibraryDocDrag()
    expect(readLibraryDocIds(dt)).toEqual(['doc-1', 'doc-2'])
  })
})
