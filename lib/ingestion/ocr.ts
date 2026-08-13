import * as fs from 'fs/promises'
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { isImageType } from '../upload/file-types'
import { logger } from '../logger'

let client: ImageAnnotatorClient | null = null

const DEFAULT_LANGUAGE_HINTS = ['zh', 'zh-CN', 'zh-TW', 'vi', 'en']

export function isOcrEnabled(): boolean {
  return process.env.OCR_ENABLED === 'true'
}

/** Raster images eligible for OCR (skip SVG — often vector/text XML). */
export function isOcrEligibleType(fileType: string): boolean {
  return isImageType(fileType) && fileType !== 'svg'
}

export function getOcrLanguageHints(): string[] {
  const raw = process.env.OCR_LANGUAGE_HINTS?.trim()
  if (!raw) return DEFAULT_LANGUAGE_HINTS
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

/** Soft warning stored on documents when OCR finds little usable text (status stays done). */
export const OCR_WEAK_CONTENT_MESSAGE =
  'Nội dung OCR quá ngắn hoặc không rõ nghĩa — ảnh vẫn được lưu. Bạn muốn giữ và sử dụng không?'

export function isOcrWeakContentWarning(message: string | null | undefined): boolean {
  return Boolean(message?.includes('Nội dung OCR quá ngắn hoặc không rõ nghĩa'))
}

export type OcrExtractResult = {
  text: string
  /** False when empty/garbled — caller should store the image without indexing. */
  usable: boolean
}

/** Detect garbled OCR (wrong language hints, grid noise, etc.). */
export function isLowQualityOcrText(text: string): boolean {
  if (!text || text.trim().length < 4) return true

  const trimmed = text.trim()
  const len = trimmed.length
  const stars = (trimmed.match(/\*/g) ?? []).length
  const htmlEntities = (trimmed.match(/&#/g) ?? []).length

  if (stars / len > 0.04 || htmlEntities > 0) return true

  const cjk = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length
  const latin = (trimmed.match(/[a-zA-Z]/g) ?? []).length
  const vietnamese = (trimmed.match(
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g
  ) ?? []).length
  const digitsPunct = (trimmed.match(/[0-9.,;:!?\-—'"()]/g) ?? []).length

  const meaningful = cjk + latin + vietnamese
  const meaningfulRatio = meaningful / len

  // Mostly symbols / noise
  if (meaningfulRatio < 0.25 && stars > 2) return true
  if (meaningfulRatio < 0.15) return true

  // Very short garbage lines
  if (len < 30 && meaningfulRatio < 0.4 && digitsPunct + stars > len * 0.3) return true

  return false
}

function getVisionClient(): ImageAnnotatorClient {
  if (client) return client

  const jsonCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (jsonCredentials) {
    const credentials = JSON.parse(jsonCredentials) as Record<string, unknown>
    client = new ImageAnnotatorClient({ credentials })
    return client
  }

  client = new ImageAnnotatorClient()
  return client
}

async function runDocumentOcr(buffer: Buffer, languageHints: string[]): Promise<string> {
  const vision = getVisionClient()
  const [result] = await vision.documentTextDetection({
    image: { content: buffer },
    imageContext: { languageHints },
  })
  return result.fullTextAnnotation?.text?.trim() ?? ''
}

/**
 * Extract plain text from an image using Google Vision DOCUMENT_TEXT_DETECTION.
 * Retries with Chinese-first hints when output looks garbled.
 * Low-quality / empty results return usable:false — do not fail the upload.
 */
export async function extractTextFromImage(filePath: string): Promise<OcrExtractResult> {
  if (!isOcrEnabled()) {
    throw new Error('OCR is disabled — set OCR_ENABLED=true')
  }

  const buffer = await fs.readFile(filePath)
  const primaryHints = getOcrLanguageHints()

  let text = await runDocumentOcr(buffer, primaryHints)

  if (isLowQualityOcrText(text)) {
    const zhHints = ['zh', 'zh-CN', 'zh-TW']
    const retryText = await runDocumentOcr(buffer, zhHints)
    if (retryText && !isLowQualityOcrText(retryText)) {
      logger.info('OCR retry with Chinese hints succeeded', { filePath })
      text = retryText
    } else if (retryText.length > text.length && !isLowQualityOcrText(retryText)) {
      text = retryText
    }
  }

  if (!text || isLowQualityOcrText(text)) {
    logger.warn('OCR returned low-quality or empty text', { filePath, charCount: text.length })
    return { text: text.trim(), usable: false }
  }

  logger.info('OCR completed', { filePath, charCount: text.length })
  return { text, usable: true }
}

/** Rough monthly OCR cost estimate (Google Vision DOCUMENT_TEXT_DETECTION pricing). */
export function estimateOcrCostUsd(imageCount: number): {
  images: number
  freeTier: number
  billableUnits: number
  estimatedUsd: number
  note: string
} {
  const freeTier = 1000
  const billableUnits = Math.max(0, imageCount - freeTier)
  const ratePer1000 = imageCount > 5_000_000 ? 0.6 : 1.5
  const estimatedUsd = (billableUnits / 1000) * ratePer1000

  return {
    images: imageCount,
    freeTier,
    billableUnits,
    estimatedUsd: Math.round(estimatedUsd * 100) / 100,
    note:
      'Giá tham khảo: $1.50/1000 ảnh (1,001–5M), $0.60/1000 trên 5M. 1,000 ảnh đầu/tháng miễn phí. Mỗi ảnh = 1 unit.',
  }
}
