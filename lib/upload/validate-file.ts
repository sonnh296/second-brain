import {
  type SupportedUploadType,
  typeFromExtension,
  isZipMagic,
  BLOCKED_EXTENSIONS,
  extensionFromFilename,
} from './file-types'

export type { SupportedUploadType } from './file-types'

function detectFromMagic(buffer: Buffer): SupportedUploadType | null {
  if (buffer.length >= 4 && buffer.slice(0, 4).equals(Buffer.from('%PDF'))) {
    return 'pdf'
  }
  if (isZipMagic(buffer)) {
    return null
  }
  if (
    buffer.length >= 8 &&
    buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  if (
    buffer.length >= 6 &&
    (buffer.slice(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.slice(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'gif'
  }
  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }
  if (buffer.length >= 5 && buffer.slice(0, 5).toString('ascii').toLowerCase() === '<svg ') {
    return 'svg'
  }
  if (buffer.length >= 5 && buffer.slice(0, 5).toString('ascii').toLowerCase() === '<?xml') {
    return 'svg'
  }
  return null
}

function resolveZipType(ext: string): SupportedUploadType {
  if (ext === 'docx' || ext === 'doc') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'zip') return 'zip'
  return 'file'
}

export function detectAndValidateFileType(
  filename: string,
  buffer: Buffer
): { ok: true; fileType: SupportedUploadType } | { ok: false; error: string } {
  const ext = extensionFromFilename(filename)
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Loại file .${ext} không được phép tải lên.` }
  }

  const fromExt = typeFromExtension(filename)
  const fromMagic = detectFromMagic(buffer)

  if (!fromExt) {
    return { ok: false, error: 'Không xác định được loại file. Vui lòng đặt tên file có phần mở rộng.' }
  }

  if (isZipMagic(buffer)) {
    const zipType = resolveZipType(ext)
    if (['docx', 'xlsx', 'pptx', 'zip'].includes(zipType)) {
      return { ok: true, fileType: zipType }
    }
    return { ok: true, fileType: fromExt }
  }

  if (fromMagic) {
    if (fromExt === 'file') {
      return { ok: true, fileType: fromMagic }
    }
    if (fromMagic === 'jpeg' && (fromExt === 'jpg' || fromExt === 'jpeg')) {
      return { ok: true, fileType: fromExt }
    }
    if (fromExt !== fromMagic && fromExt !== 'txt' && fromExt !== 'md' && fromExt !== 'file') {
      return {
        ok: false,
        error: `Nội dung file không khớp phần mở rộng (mong đợi ${fromExt}, phát hiện ${fromMagic})`,
      }
    }
    return { ok: true, fileType: fromExt === 'file' ? fromMagic : fromExt }
  }

  if (['txt', 'md', 'csv', 'json', 'html', 'svg'].includes(fromExt)) {
    return { ok: true, fileType: fromExt }
  }

  if (fromExt === 'pdf' || fromExt === 'docx') {
    return {
      ok: false,
      error: `File ${fromExt.toUpperCase()} không hợp lệ — nội dung không đúng định dạng`,
    }
  }

  return { ok: true, fileType: fromExt }
}
