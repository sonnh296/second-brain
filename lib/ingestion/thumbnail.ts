import * as fs from 'fs/promises'
import sharp from 'sharp'
import { isImageType } from '../upload/file-types'
import { uploadBuffer } from '../storage'
import { logger } from '../logger'
import { documentThumbnailKey } from '../storage/thumbnail-key'

export { documentThumbnailKey }
export const THUMB_MAX_PX = 360
export const THUMB_JPEG_QUALITY = 72

export function canMakeImageThumbnail(fileType: string): boolean {
  return isImageType(fileType)
}

export async function renderImageThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input, { animated: false, failOn: 'none' })
    .rotate()
    .resize(THUMB_MAX_PX, THUMB_MAX_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
}

export async function storeDocumentThumbnailFromFile(
  userId: string,
  documentId: string,
  filePath: string
): Promise<string | null> {
  const input = await fs.readFile(filePath)
  return storeDocumentThumbnailFromBuffer(userId, documentId, input)
}

export async function storeDocumentThumbnailFromBuffer(
  userId: string,
  documentId: string,
  input: Buffer
): Promise<string | null> {
  try {
    const thumb = await renderImageThumbnail(input)
    const key = documentThumbnailKey(userId, documentId)
    await uploadBuffer(key, thumb, 'image/jpeg')
    return key
  } catch (err) {
    logger.warn('Failed to create document thumbnail', { err, documentId, userId })
    return null
  }
}
