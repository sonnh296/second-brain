import { isOcrWeakContentWarning } from '@/lib/ingestion/ocr-status'
import { isImageType } from '@/lib/upload/file-types'

/** Failed files, plus images kept with a weak-OCR warning (same UX as retrying a video). */
export function canReuploadDocument(doc: {
  status: string
  file_type: string
  error_message?: string | null
}): boolean {
  if (doc.file_type === 'note') return false
  if (doc.status === 'failed') return true
  return isImageType(doc.file_type) && isOcrWeakContentWarning(doc.error_message)
}
