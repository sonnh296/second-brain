import * as fs from 'fs/promises'
import * as path from 'path'

export type SupportedFileType = 'pdf' | 'docx' | 'txt' | 'md' | 'csv' | 'json' | 'html'

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
