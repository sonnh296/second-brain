export interface TextChunk {
  text: string
  index: number
}

const AVG_CHARS_PER_TOKEN = 4
const TARGET_CHUNK_TOKENS = 650        // midpoint of 500–800
const OVERLAP_TOKENS = 75              // midpoint of 50–100
const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * AVG_CHARS_PER_TOKEN  // 2600
const OVERLAP_CHARS = OVERLAP_TOKENS * AVG_CHARS_PER_TOKEN             // 300

/**
 * Split text into overlapping chunks.
 * Tries to break at paragraph or sentence boundaries for better context quality.
 */
export function chunkText(text: string): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (normalized.length === 0) return []

  const chunks: TextChunk[] = []
  let start = 0
  let index = 0

  while (start < normalized.length) {
    let end = Math.min(start + TARGET_CHUNK_CHARS, normalized.length)

    // Try to snap to a paragraph break within ±200 chars of end
    if (end < normalized.length) {
      const nearbyBreak = normalized.lastIndexOf('\n\n', end + 200)
      if (nearbyBreak > start + TARGET_CHUNK_CHARS / 2) {
        end = nearbyBreak
      } else {
        // Fall back to sentence boundary
        const sentenceBreak = normalized.lastIndexOf('. ', end)
        if (sentenceBreak > start + TARGET_CHUNK_CHARS / 2) {
          end = sentenceBreak + 1
        }
      }
    }

    const chunkText = normalized.slice(start, end).trim()
    if (chunkText.length > 0) {
      chunks.push({ text: chunkText, index })
      index++
    }

    // Reached end of document — stop (avoid infinite loop on small remainders)
    if (end >= normalized.length) break

    start = end - OVERLAP_CHARS
    if (start < 0) start = 0
  }

  return chunks
}
