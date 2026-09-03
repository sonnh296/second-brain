import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { workbookToText } from './parse'

function makeWorkbook(
  sheets: Record<string, (string | number)[][]>
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }
  return workbook
}

describe('workbookToText', () => {
  it('formats multiple sheets as markdown headings + TSV rows', () => {
    const workbook = makeWorkbook({
      Sales: [
        ['Name', 'Amount'],
        ['Alice', 10],
        ['Bob', 20],
      ],
      Empty: [],
      Notes: [['hello']],
    })

    const text = workbookToText(workbook)
    expect(text).toContain('## Sales')
    expect(text).toContain('Name\tAmount')
    expect(text).toContain('Alice\t10')
    expect(text).toContain('Bob\t20')
    expect(text).toContain('## Notes')
    expect(text).toContain('hello')
    expect(text).not.toContain('## Empty')
  })

  it('skips blank-only workbooks with a clear error', () => {
    const workbook = makeWorkbook({
      A: [],
      B: [],
    })
    expect(() => workbookToText(workbook)).toThrow(/empty content/i)
  })

  it('truncates when exceeding maxRows and appends a note', () => {
    const workbook = makeWorkbook({
      Big: [
        ['a', 'b'],
        ['1', '2'],
        ['3', '4'],
        ['5', '6'],
      ],
    })

    const text = workbookToText(workbook, 2)
    expect(text).toContain('## Big')
    expect(text).toContain('a\tb')
    expect(text).toContain('1\t2')
    expect(text).not.toContain('3\t4')
    expect(text).toMatch(/Truncated/i)
  })
})
