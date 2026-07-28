import * as fs from 'node:fs/promises'

export type SupportedFileType = 'pdf' | 'docx' | 'txt' | 'md' | 'csv' | 'json' | 'html'

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
export async function parseFile(
  filePath: string,
  fileType: string
): Promise<string> {
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
