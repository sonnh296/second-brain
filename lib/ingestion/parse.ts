import * as fs from 'node:fs/promises'
import * as XLSX from 'xlsx'
import type { WorkBook } from 'xlsx'

export type SupportedFileType =
  | 'pdf'
  | 'docx'
  | 'txt'
  | 'md'
  | 'csv'
  | 'json'
  | 'html'
  | 'xlsx'
  | 'xls'

/** Char offset where each page begins inside the combined text. */
export interface PageOffset {
  page: number
  start: number
}

export interface ParsedDocument {
  text: string
  /** Only for PDFs — enables page-accurate citations. Null for other types. */
  pageOffsets: PageOffset[] | null
}

/** Soft cap so huge spreadsheets do not blow up chunk/embed. */
export const EXCEL_MAX_INDEX_ROWS = 50_000

/**
 * Convert a SheetJS workbook to plain text for RAG indexing.
 * Format: `## SheetName` then tab-separated rows.
 */
export function workbookToText(
  workbook: WorkBook,
  maxRows: number = EXCEL_MAX_INDEX_ROWS
): string {
  const parts: string[] = []
  let totalRows = 0
  let truncated = false

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(
      sheet,
      {
        header: 1,
        defval: '',
        blankrows: false,
        raw: false,
      }
    )

    if (rows.length === 0) continue

    if (totalRows >= maxRows) {
      truncated = true
      break
    }

    const remaining = maxRows - totalRows
    const slice = rows.length > remaining ? rows.slice(0, remaining) : rows
    if (rows.length > remaining) truncated = true

    parts.push(`## ${sheetName}`)
    for (const row of slice) {
      const cells = Array.isArray(row) ? row : [row]
      parts.push(cells.map((cell) => String(cell ?? '')).join('\t'))
    }
    totalRows += slice.length
  }

  if (parts.length === 0) {
    throw new Error('Excel parsed to empty content — file may be corrupt or have no cells')
  }

  let text = parts.join('\n')
  if (truncated) {
    text += `\n\n[Truncated: spreadsheet exceeded ${maxRows.toLocaleString('en-US')} row limit for indexing]`
  }
  return text
}

/**
 * Parse a file and return text plus page offsets (PDF only).
 * Page texts are joined with '\n\n' so offsets stay valid after chunking.
 */
export async function parseFileWithPages(
  filePath: string,
  fileType: string
): Promise<ParsedDocument> {
  if (fileType.toLowerCase() === 'pdf') {
    const { PDFParse } = await import('pdf-parse')
    const buffer = await fs.readFile(filePath)
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      const pageOffsets: PageOffset[] = []
      const parts: string[] = []
      let offset = 0
      for (const page of result.pages) {
        const pageText = page.text.replace(/\r\n/g, '\n').trim()
        if (!pageText) continue
        pageOffsets.push({ page: page.num, start: offset })
        parts.push(pageText)
        offset += pageText.length + 2 // '\n\n' separator
      }
      if (parts.length === 0) {
        return { text: result.text, pageOffsets: null }
      }
      return { text: parts.join('\n\n'), pageOffsets }
    } finally {
      await parser.destroy()
    }
  }

  return { text: await parseFile(filePath, fileType), pageOffsets: null }
}

/**
 * Parse a file from a local path and return its plain text content.
 * Throws on parse failure so the worker can set status = 'failed'.
 */
export async function parseFile(filePath: string, fileType: string): Promise<string> {
  switch (fileType.toLowerCase()) {
    case 'pdf': {
      const { PDFParse } = await import('pdf-parse')
      const buffer = await fs.readFile(filePath)
      const parser = new PDFParse({ data: buffer })
      try {
        const result = await parser.getText()
        return result.text
      } finally {
        await parser.destroy()
      }
    }

    case 'docx': {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      if (!result.value || result.value.trim().length === 0) {
        throw new Error('DOCX parsed to empty content — file may be corrupt or not a valid DOCX')
      }
      return result.value
    }

    case 'xlsx':
    case 'xls': {
      const buffer = await fs.readFile(filePath)
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
      return workbookToText(workbook)
    }

    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
    case 'html': {
      const content = await fs.readFile(filePath, 'utf-8')
      return content
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`)
  }
}
