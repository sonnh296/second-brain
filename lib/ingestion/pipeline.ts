import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import { v5 as uuidv5 } from 'uuid'
import { isIndexableType, isTranscribableType } from '../upload/file-types'
import { parseFileWithPages, type PageOffset } from './parse'
import { chunkText, textForEmbedding } from './chunk'
import { embedBatch } from './embed'
import {
  extractTextFromImage,
  isOcrEligibleType,
  isOcrEnabled,
  OCR_WEAK_CONTENT_MESSAGE,
} from './ocr'
import { transcribeMediaFile, isTranscriptionEnabled } from './transcribe'
import { upsertChunks, ensureCollection, deleteByDocument, listChunksByDocument } from '../vector'
import { downloadToFile } from '../storage'
import { createServiceSupabaseClient } from '../db/server'
import { logger } from '../logger'

// Stable namespace for deterministic Qdrant point IDs
const POINT_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

// Process embed → Qdrant → Postgres in small batches to cap peak RAM
const INGESTION_BATCH_SIZE = 32

function makePointId(documentId: string, chunkIndex: number): string {
  return uuidv5(`${documentId}:${chunkIndex}`, POINT_ID_NAMESPACE)
}

function hashContent(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex')
}

/** Copy vectors + chunk rows from an existing document (dedup without re-embedding). */
async function copyFromDuplicateDocument(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  sourceDocumentId: string,
  targetDocumentId: string,
  displayFilename: string,
  contentHash: string
): Promise<number> {
  await ensureCollection()

  const sourceChunks = await listChunksByDocument(userId, sourceDocumentId)
  if (sourceChunks.length === 0) {
    return 0
  }

  await deleteByDocument(userId, targetDocumentId)
  await supabase.from('document_chunks').delete().eq('document_id', targetDocumentId)

  let processedCount = 0
  for (let i = 0; i < sourceChunks.length; i += INGESTION_BATCH_SIZE) {
    const batch = sourceChunks.slice(i, i + INGESTION_BATCH_SIZE)

    await upsertChunks(
      batch.map((chunk) => ({
        pointId: makePointId(targetDocumentId, chunk.payload.chunk_index),
        vector: chunk.vector,
        payload: {
          user_id: userId,
          document_id: targetDocumentId,
          filename: displayFilename,
          chunk_index: chunk.payload.chunk_index,
          chunk_text: chunk.payload.chunk_text,
          ...(chunk.payload.page !== undefined ? { page: chunk.payload.page } : {}),
        },
      }))
    )

    const chunkRows = batch.map((chunk) => ({
      document_id: targetDocumentId,
      user_id: userId,
      chunk_text: chunk.payload.chunk_text,
      chunk_index: chunk.payload.chunk_index,
      qdrant_point_id: makePointId(targetDocumentId, chunk.payload.chunk_index),
      page: chunk.payload.page ?? null,
    }))
    await supabase.from('document_chunks').insert(chunkRows)

    processedCount += batch.length
    await supabase
      .from('documents')
      .update({ chunk_count: processedCount })
      .eq('id', targetDocumentId)
  }

  await supabase
    .from('documents')
    .update({
      status: 'done',
      chunk_count: sourceChunks.length,
      error_message: null,
      content_hash: contentHash,
    })
    .eq('id', targetDocumentId)

  const { data: sourceDoc } = await supabase
    .from('documents')
    .select('extracted_content, ocr_text')
    .eq('id', sourceDocumentId)
    .single()

  if (sourceDoc?.extracted_content || sourceDoc?.ocr_text) {
    await supabase
      .from('documents')
      .update({
        extracted_content: sourceDoc.extracted_content ?? sourceDoc.ocr_text,
      })
      .eq('id', targetDocumentId)
  }

  return sourceChunks.length
}

async function markStorageOnlyDone(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  documentId: string
): Promise<void> {
  await supabase
    .from('documents')
    .update({ status: 'done', chunk_count: 0, error_message: null })
    .eq('id', documentId)
}

/** Map a chunk's char offset to the PDF page it starts on. */
function pageForOffset(pageOffsets: PageOffset[], offset: number): number | undefined {
  let page: number | undefined
  for (const p of pageOffsets) {
    if (p.start <= offset) page = p.page
    else break
  }
  return page
}

async function indexExtractedText(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  documentId: string,
  userId: string,
  displayFilename: string,
  rawText: string,
  extraUpdates?: Record<string, unknown>,
  pageOffsets?: PageOffset[] | null
): Promise<void> {
  const contentUpdates = { extracted_content: rawText, ...extraUpdates }
  const chunks = chunkText(rawText)
  if (chunks.length === 0) {
    throw new Error('Document parsed to empty content')
  }

  const contentHash = hashContent(rawText)
  const { data: duplicate } = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('content_hash', contentHash)
    .neq('id', documentId)
    .eq('status', 'done')
    .limit(1)
    .maybeSingle()

  if (duplicate) {
    const copied = await copyFromDuplicateDocument(
      supabase,
      userId,
      duplicate.id,
      documentId,
      displayFilename,
      contentHash
    )
    if (copied > 0) {
      await supabase.from('documents').update(contentUpdates).eq('id', documentId)
      logger.info('Duplicate document copied from source', {
        documentId,
        sourceDocumentId: duplicate.id,
        chunkCount: copied,
        userId,
      })
      return
    }
    logger.warn('Duplicate source has no vectors, re-embedding', {
      documentId,
      sourceDocumentId: duplicate.id,
      userId,
    })
  }

  await supabase
    .from('documents')
    .update({ content_hash: contentHash, ...contentUpdates })
    .eq('id', documentId)

  await ensureCollection()
  await deleteByDocument(userId, documentId)
  await supabase.from('document_chunks').delete().eq('document_id', documentId)

  let processedCount = 0
  for (let i = 0; i < chunks.length; i += INGESTION_BATCH_SIZE) {
    const batch = chunks.slice(i, i + INGESTION_BATCH_SIZE)
    const indexedTexts = batch.map((c) => textForEmbedding(displayFilename, c.text))
    const vectors = await embedBatch(indexedTexts, {
      userId,
      purpose: 'embedding_ingest',
      documentId,
    })

    const pageOf = (chunk: (typeof batch)[0]) =>
      pageOffsets?.length ? pageForOffset(pageOffsets, chunk.start) : undefined

    await upsertChunks(
      batch.map((chunk, j) => ({
        pointId: makePointId(documentId, chunk.index),
        vector: vectors[j],
        payload: {
          user_id: userId,
          document_id: documentId,
          filename: displayFilename,
          chunk_index: chunk.index,
          chunk_text: indexedTexts[j],
          ...(pageOf(chunk) !== undefined ? { page: pageOf(chunk) } : {}),
        },
      }))
    )

    const chunkRows = batch.map((chunk, j) => ({
      document_id: documentId,
      user_id: userId,
      chunk_text: indexedTexts[j],
      chunk_index: chunk.index,
      qdrant_point_id: makePointId(documentId, chunk.index),
      page: pageOf(chunk) ?? null,
    }))
    await supabase.from('document_chunks').insert(chunkRows)

    processedCount += batch.length
    await supabase
      .from('documents')
      .update({ chunk_count: processedCount })
      .eq('id', documentId)

    logger.info('Ingestion batch progress', {
      documentId,
      processedCount,
      totalChunks: chunks.length,
      userId,
    })
  }

  const storedContent =
    extraUpdates && 'extracted_content' in extraUpdates
      ? (extraUpdates.extracted_content as string | null)
      : rawText

  await supabase
    .from('documents')
    .update({
      status: 'done',
      chunk_count: chunks.length,
      extracted_content: storedContent,
    })
    .eq('id', documentId)
}

export async function runIngestionPipeline(
  documentId: string,
  r2Key: string,
  fileType: string,
  userId: string,
  filename: string,
  manualContent?: string
): Promise<void> {
  // os.tmpdir() respects TMPDIR — on the server this must point to disk,
  // because /tmp is a small RAM-backed tmpfs that large videos would fill.
  const tempPath =
    fileType === 'note' ? null : path.join(os.tmpdir(), `${documentId}.${fileType}`)

  try {
    const supabase = createServiceSupabaseClient()

    const { data: docRecord } = await supabase
      .from('documents')
      .select('user_id, filename, description')
      .eq('id', documentId)
      .single()

    if (!docRecord || docRecord.user_id !== userId) {
      throw new Error('Document ownership mismatch')
    }

    const displayFilename = docRecord.filename ?? filename

    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId)

    const canOcr = isOcrEnabled() && isOcrEligibleType(fileType)
    const canTranscribe = isTranscriptionEnabled() && isTranscribableType(fileType)

    if (!isIndexableType(fileType) && !canOcr && !canTranscribe) {
      // Media files must never silently skip when transcription is supposed to be on.
      if (isTranscribableType(fileType) && !isTranscriptionEnabled()) {
        throw new Error(
          'Transcription chưa được bật (cần OPENAI_API_KEY / TRANSCRIPTION_ENABLED)'
        )
      }
      await markStorageOnlyDone(supabase, documentId)
      logger.info('Storage-only file marked done (no indexing)', {
        documentId,
        fileType,
        userId,
      })
      return
    }

    let rawText: string
    let pageOffsets: PageOffset[] | null = null

    if (manualContent?.trim()) {
      rawText = manualContent.trim()
    } else if (fileType === 'note') {
      const { data: doc } = await supabase
        .from('documents')
        .select('note_content')
        .eq('id', documentId)
        .single()
      if (!doc?.note_content?.trim()) {
        throw new Error('Note content is empty')
      }
      rawText = doc.note_content
    } else {
      try {
        await downloadToFile(r2Key, tempPath!)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/specified key does not exist|NoSuchKey|NotFound/i.test(msg)) {
          throw new Error(
            'File không còn trên kho lưu trữ (R2). Có thể upload bị gián đoạn — hãy tải lên lại.'
          )
        }
        throw err
      }
      if (canOcr) {
        const ocr = await extractTextFromImage(tempPath!)
        if (!ocr.usable) {
          await supabase
            .from('documents')
            .update({
              status: 'done',
              chunk_count: 0,
              error_message: OCR_WEAK_CONTENT_MESSAGE,
              ocr_text: ocr.text || null,
              extracted_content: ocr.text || null,
            })
            .eq('id', documentId)
          logger.info('Image stored without OCR indexing (weak/empty text)', {
            documentId,
            fileType,
            userId,
            charCount: ocr.text.length,
          })
          return
        }
        rawText = ocr.text
        logger.info('Image OCR text extracted for indexing', {
          documentId,
          fileType,
          userId,
          charCount: rawText.length,
        })
      } else if (canTranscribe) {
        const transcript = await transcribeMediaFile(tempPath!, { documentId, userId })
        const description = docRecord.description?.trim()
        if (!transcript.text && !description) {
          await supabase
            .from('documents')
            .update({
              status: 'done',
              chunk_count: 0,
              error_message: 'Không có lời thoại trong video',
              extracted_content: null,
            })
            .eq('id', documentId)
          logger.warn('Media transcribed to empty text, stored without indexing', {
            documentId,
            fileType,
            userId,
          })
          return
        }
        // Index description + transcript for search; store only transcript as the subtitle text.
        rawText = [description ? `Mô tả: ${description}` : '', transcript.text]
          .filter(Boolean)
          .join('\n\n')
        await indexExtractedText(
          supabase,
          documentId,
          userId,
          displayFilename,
          rawText,
          { extracted_content: transcript.text || null },
          pageOffsets
        )
        return
      } else {
        const parsed = await parseFileWithPages(tempPath!, fileType)
        rawText = parsed.text
        pageOffsets = parsed.pageOffsets
      }
    }

    await indexExtractedText(
      supabase,
      documentId,
      userId,
      displayFilename,
      rawText,
      canOcr ? { ocr_text: rawText } : undefined,
      pageOffsets
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Ingestion failed', { err: message, documentId, userId })
    try {
      const supabase = createServiceSupabaseClient()
      await supabase
        .from('documents')
        .update({ status: 'failed', error_message: message })
        .eq('id', documentId)
    } catch {
      // env not configured — can't update DB
    }
    throw err
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => {})
    }
  }
}
