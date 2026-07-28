import type { CitedSource } from '@/lib/db/types'

export interface RetrievedSource {
  filename: string
  chunk_index: number
  chunk_text: string
  score: number
  document_id?: string
  file_type?: string
  page?: number
}

const CITATIONS_REGEX = /<!--CITATIONS:(\[.*?\])-->\s*$/

/**
 * Parse model citation block and strip it from visible content.
 * Format: <!--CITATIONS:["file.txt:0","other.pdf:3"]-->
 *
 * Trust policy: only return sources the model explicitly cited.
 * Missing/malformed blocks yield empty citations (no silent top-N fallback).
 */
export function parseCitationsFromResponse(
  text: string,
  availableSources: RetrievedSource[]
): { content: string; citedSources: CitedSource[] } {
  const match = text.match(CITATIONS_REGEX)
  if (!match) {
    return { content: text, citedSources: [] }
  }

  const content = text.replace(CITATIONS_REGEX, '').trimEnd()

  try {
    const refs = JSON.parse(match[1]) as string[]
    const citedSources: CitedSource[] = []

    for (const ref of refs) {
      const colonIdx = ref.lastIndexOf(':')
      if (colonIdx === -1) continue
      const filename = ref.slice(0, colonIdx)
      const chunkIndex = parseInt(ref.slice(colonIdx + 1), 10)
      if (Number.isNaN(chunkIndex)) continue

      const found = availableSources.find(
        (s) => s.filename === filename && s.chunk_index === chunkIndex
      )
      if (found) {
        citedSources.push({
          filename,
          chunk_index: chunkIndex,
          document_id: found.document_id,
          file_type: found.file_type,
          page: found.page,
        })
      }
    }

    return { content, citedSources }
  } catch {
    return { content, citedSources: [] }
  }
}
