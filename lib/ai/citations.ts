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

const CITATIONS_REGEX = /<!--\s*CITATIONS\s*:\s*(\[[\s\S]*?\])\s*-->\s*$/i

/** Extensions we store in the library (docs, images, audio/video — treated equally). */
const LIBRARY_FILE_EXT =
  'pdf|docx?|xlsx?|pptx?|txt|md|csv|json|png|jpe?g|gif|webp|bmp|tiff?|mp4|mov|webm|mp3|wav|m4a|aac|ogg|html?|zip|note'

// No spaces in basename — avoids swallowing prose ("Không liên quan Weixin…png").
// Spaced names still resolve via citationsFromLibraryDocs includes() when docs are loaded.
const FILENAME_IN_TEXT_RE = new RegExp(
  String.raw`(?:^|[^\w.\-/])([\w\-()[\]\u00C0-\u024F\u1E00-\u1EFF]+\.(?:${LIBRARY_FILE_EXT}))\b`,
  'gi'
)

/**
 * Extract filename-like tokens with library extensions from answer text.
 * Used to resolve citations for files outside the retrieval pool (e.g. video with no chunks).
 */
export function extractFilenamesFromText(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  FILENAME_IN_TEXT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FILENAME_IN_TEXT_RE.exec(text)) !== null) {
    const name = match[1].trim()
    if (name.length < 5) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** Build citation badges from library docs whose filenames appear in the answer. */
export function citationsFromLibraryDocs(
  answerContent: string,
  docs: { id: string; filename: string; file_type: string }[],
  options: { maxFiles?: number } = {}
): CitedSource[] {
  const maxFiles = options.maxFiles ?? 3
  if (docs.length === 0) return []

  const lower = answerContent.toLowerCase()
  const extracted = new Set(extractFilenamesFromText(answerContent).map((n) => n.toLowerCase()))

  const matched = docs.filter((d) => {
    if (d.filename.length < 3) return false
    const fname = d.filename.toLowerCase()
    return lower.includes(fname) || extracted.has(fname)
  })

  // Prefer longer filenames first to avoid short-name false positives crowding out.
  matched.sort((a, b) => b.filename.length - a.filename.length)

  return dedupeCitedSourcesByFile(
    matched.slice(0, maxFiles).map((d) => ({
      filename: d.filename,
      chunk_index: 0,
      document_id: d.id,
      file_type: d.file_type,
    }))
  )
}

/**
 * Parse model citation block and strip it from visible content.
 * Format: <!--CITATIONS:["file.txt:0","other.pdf:3"]-->
 *
 * Trust policy: prefer model-explicit citations. Callers may soft-fallback
 * via fallbackCitationsFromSources / library filename resolve when the block
 * is missing/empty — mention-only, never invent from retrieval score.
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
      if (typeof ref !== 'string') continue
      const colonIdx = ref.lastIndexOf(':')
      if (colonIdx === -1) continue
      const filename = ref.slice(0, colonIdx)
      const chunkIndex = parseInt(ref.slice(colonIdx + 1), 10)
      if (Number.isNaN(chunkIndex)) continue

      const found =
        availableSources.find(
          (s) => s.filename === filename && s.chunk_index === chunkIndex
        ) ?? availableSources.find((s) => s.filename === filename)
      if (found) {
        citedSources.push({
          filename: found.filename,
          chunk_index: found.chunk_index,
          document_id: found.document_id,
          file_type: found.file_type,
          page: found.page,
        })
      }
    }

    return { content, citedSources: dedupeCitedSourcesByFile(citedSources) }
  } catch {
    return { content, citedSources: [] }
  }
}

/**
 * One badge per file. Keep the first cited chunk (and its PDF page if any).
 * Also used when rendering older messages that stored per-chunk citations.
 */
export function dedupeCitedSourcesByFile(sources: CitedSource[]): CitedSource[] {
  const seen = new Set<string>()
  const unique: CitedSource[] = []

  for (const src of sources) {
    const key = src.document_id || src.filename
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(src)
  }

  return unique
}
