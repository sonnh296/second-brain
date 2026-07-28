import type { AttachedImage } from '@/components/chat/types'

export const MAX_ATTACH_IMAGES = 5
export const MAX_ATTACH_BYTES = 5 * 1024 * 1024
export const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

/** Claude vision xử lý tối đa ~1568px — resize trước khi gửi để giảm token/băng thông. */
const MAX_IMAGE_DIMENSION = 1568
const RESIZE_QUALITY = 0.85

export async function downscaleImage(
  file: File
): Promise<{ blob: Blob; mediaType: AttachedImage['mediaType'] }> {
  // GIF giữ nguyên để không mất animation
  if (file.type === 'image/gif') {
    return { blob: file, mediaType: 'image/gif' }
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))

    // Ảnh đã nhỏ và nhẹ thì gửi nguyên bản
    if (scale === 1 && file.size <= 1024 * 1024) {
      bitmap.close()
      return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
    }
    // Nền trắng cho PNG trong suốt khi chuyển sang JPEG
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', RESIZE_QUALITY)
    )
    if (!blob) {
      return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
    }
    return { blob, mediaType: 'image/jpeg' }
  } catch {
    return { blob: file, mediaType: file.type as AttachedImage['mediaType'] }
  }
}

export async function fileToAttachedImage(file: File): Promise<AttachedImage> {
  const { blob, mediaType } = await downscaleImage(file)
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(blob),
    base64,
    mediaType,
  }
}
