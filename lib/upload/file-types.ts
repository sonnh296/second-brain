/** File types that are chunked and embedded for RAG search. */
export const INDEXABLE_TYPES = new Set([
  'pdf',
  'docx',
  'txt',
  'md',
  'csv',
  'json',
  'html',
  'note',
])

export const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])

export const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'msi',
  'dll',
  'scr',
  'vbs',
  'ps1',
  'sh',
])

export type SupportedUploadType =
  | 'pdf'
  | 'docx'
  | 'txt'
  | 'md'
  | 'csv'
  | 'json'
  | 'html'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'svg'
  | 'xlsx'
  | 'xls'
  | 'pptx'
  | 'ppt'
  | 'zip'
  | 'mp3'
  | 'wav'
  | 'mp4'
  | 'mov'
  | 'file'

const EXT_MAP: Record<string, SupportedUploadType> = {
  pdf: 'pdf',
  docx: 'docx',
  doc: 'docx',
  txt: 'txt',
  md: 'md',
  markdown: 'md',
  csv: 'csv',
  json: 'json',
  html: 'html',
  htm: 'html',
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpeg',
  gif: 'gif',
  webp: 'webp',
  svg: 'svg',
  xlsx: 'xlsx',
  xls: 'xls',
  pptx: 'pptx',
  ppt: 'ppt',
  zip: 'zip',
  mp3: 'mp3',
  wav: 'wav',
  mp4: 'mp4',
  mov: 'mov',
}

export const UPLOAD_ACCEPT =
  '.pdf,.doc,.docx,.txt,.md,.csv,.json,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.svg,.xlsx,.xls,.pptx,.ppt,.zip,.mp3,.wav,.mp4,.mov'

export const TYPE_LABELS: Record<string, string> = {
  all: 'Tất cả',
  note: 'Ghi chú',
  pdf: 'PDF',
  docx: 'Word',
  txt: 'Văn bản',
  md: 'Markdown',
  csv: 'CSV',
  json: 'JSON',
  html: 'HTML',
  png: 'PNG',
  jpg: 'JPEG',
  jpeg: 'JPEG',
  gif: 'GIF',
  webp: 'WebP',
  svg: 'SVG',
  xlsx: 'Excel',
  xls: 'Excel',
  pptx: 'PowerPoint',
  ppt: 'PowerPoint',
  zip: 'ZIP',
  mp3: 'MP3',
  wav: 'WAV',
  mp4: 'MP4',
  mov: 'MOV',
  file: 'Tệp khác',
}

export const MIME_BY_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

export function extensionFromFilename(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export function typeFromExtension(filename: string): SupportedUploadType | null {
  const ext = extensionFromFilename(filename)
  if (!ext) return null
  if (BLOCKED_EXTENSIONS.has(ext)) return null
  return EXT_MAP[ext] ?? 'file'
}

export function isIndexableType(fileType: string): boolean {
  return INDEXABLE_TYPES.has(fileType)
}

export function isImageType(fileType: string): boolean {
  return IMAGE_TYPES.has(fileType)
}

/** Types the browser can usually display inline (not force-download). */
export const INLINE_VIEW_TYPES = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'txt',
  'md',
  'csv',
  'html',
  'json',
  'mp3',
  'wav',
  'mp4',
  'mov',
])

export function isBrowserInlineType(fileType: string): boolean {
  return INLINE_VIEW_TYPES.has(fileType)
}

export function mimeForType(fileType: string): string {
  return MIME_BY_TYPE[fileType] ?? 'application/octet-stream'
}

export function isZipMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  )
}
