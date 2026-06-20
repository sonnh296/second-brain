import { Readable } from 'stream'
import { detectAndValidateFileType, type SupportedUploadType } from './validate-file'

const HEADER_BYTES = 512
export const MAX_UPLOAD_DESCRIPTION_LENGTH = 500

export interface ValidatedUploadStream {
  stream: Readable
  fileType: SupportedUploadType
  fileSizeBytes: number
}

/**
 * Validate file type from the first bytes, then stream the full file without
 * loading it entirely into RAM.
 */
export async function createValidatedUploadStream(
  file: File,
  filename: string
): Promise<
  { ok: true; result: ValidatedUploadStream } | { ok: false; error: string }
> {
  if (file.size === 0) {
    return { ok: false, error: 'Empty file' }
  }

  const reader = file.stream().getReader()
  const prefixChunks: Uint8Array[] = []
  let prefixLength = 0

  try {
    while (prefixLength < HEADER_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.length) continue
      prefixChunks.push(value)
      prefixLength += value.length
    }

    const headerBuffer = Buffer.concat(prefixChunks.map((c) => Buffer.from(c)))
    const validation = detectAndValidateFileType(filename, headerBuffer)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    const fileType = validation.fileType
    const stream = Readable.from(
      (async function* () {
        for (const chunk of prefixChunks) {
          yield Buffer.from(chunk)
        }
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value?.length) yield Buffer.from(value)
        }
      })()
    )

    return {
      ok: true,
      result: {
        stream,
        fileType,
        fileSizeBytes: file.size,
      },
    }
  } catch {
    reader.releaseLock()
    return { ok: false, error: 'Failed to read upload stream' }
  }
}
