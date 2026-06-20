export type SupportedUploadType = 'pdf' | 'docx' | 'txt'

const EXT_MAP: Record<string, SupportedUploadType | 'audio' | 'video'> = {
  pdf: 'pdf',
  docx: 'docx',
  doc: 'docx',
  txt: 'txt',
  mp3: 'audio',
  wav: 'audio',
  mp4: 'video',
  mov: 'video',
}

function detectFromMagic(buffer: Buffer): SupportedUploadType | null {
  if (buffer.length >= 4 && buffer.slice(0, 4).equals(Buffer.from('%PDF'))) {
    return 'pdf'
  }
  if (
    buffer.length >= 4 &&
    buffer.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  ) {
    return 'docx'
  }
  return null
}

function detectFromExtension(filename: string): SupportedUploadType | 'audio' | 'video' | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MAP[ext] ?? null
}

export function detectAndValidateFileType(
  filename: string,
  buffer: Buffer
): { ok: true; fileType: SupportedUploadType } | { ok: false; error: string } {
  const fromExt = detectFromExtension(filename)
  const fromMagic = detectFromMagic(buffer)

  if (fromExt === 'audio' || fromExt === 'video') {
    return {
      ok: false,
      error: 'Audio and video uploads are not supported yet. Please upload PDF, DOCX, or TXT.',
    }
  }

  if (fromExt && fromExt !== 'txt' && fromMagic && fromExt !== fromMagic) {
    return {
      ok: false,
      error: `File content does not match extension (expected ${fromExt}, detected ${fromMagic})`,
    }
  }

  if (fromMagic) {
    return { ok: true, fileType: fromMagic }
  }

  if (fromExt === 'txt' || fromExt === null) {
    return { ok: true, fileType: 'txt' }
  }

  if (fromExt === 'pdf' || fromExt === 'docx') {
    return {
      ok: false,
      error: `Invalid ${fromExt.toUpperCase()} file — content does not match expected format`,
    }
  }

  return { ok: true, fileType: 'txt' }
}
