import { describe, it, expect } from 'vitest'
import { Readable } from 'stream'
import { createValidatedUploadStream } from './create-upload-stream'

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

describe('createValidatedUploadStream', () => {
  it('streams full PDF content without pre-buffering entire file', async () => {
    const content = '%PDF-1.4\n' + 'x'.repeat(2048)
    const file = new File([content], 'doc.pdf', { type: 'application/pdf' })

    const result = await createValidatedUploadStream(file, 'doc.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.result.fileType).toBe('pdf')
    expect(result.result.fileSizeBytes).toBe(file.size)

    const uploaded = await streamToBuffer(result.result.stream)
    expect(uploaded.toString()).toBe(content)
  })

  it('rejects invalid file type before streaming', async () => {
    const file = new File(['not audio'], 'song.mp3', { type: 'audio/mpeg' })
    const result = await createValidatedUploadStream(file, 'song.mp3')
    expect(result.ok).toBe(false)
  })
})
