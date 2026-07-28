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
 */
export function parseCitationsFromResponse(
  text: string,
  availableSources: RetrievedSource[]
): { content: string; citedSources: CitedSource[] } {
  const match = text.match(CITATIONS_REGEX)
  if (!match) {
    return {
      content: text,
      citedSources: fallbackCitations(availableSources, 3),
    }
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

    if (citedSources.length > 0) {
      return { content, citedSources }
    }
  } catch {
    // fall through to fallback
  }

  return {
    content,
    citedSources: fallbackCitations(availableSources, 3),
  }
}

function fallbackCitations(
  sources: RetrievedSource[],
  limit: number
): CitedSource[] {
  return sources
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      filename: s.filename,
      chunk_index: s.chunk_index,
      document_id: s.document_id,
      file_type: s.file_type,
      page: s.page,
    }))
}
