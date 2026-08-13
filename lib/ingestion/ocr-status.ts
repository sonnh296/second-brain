/** Soft warning stored on documents when OCR finds little usable text (status stays done). */
export const OCR_WEAK_CONTENT_MESSAGE =
  'Nội dung OCR quá ngắn hoặc không rõ nghĩa — ảnh vẫn được lưu. Bạn muốn giữ và sử dụng không?'

export function isOcrWeakContentWarning(message: string | null | undefined): boolean {
  return Boolean(message?.includes('Nội dung OCR quá ngắn hoặc không rõ nghĩa'))
}
