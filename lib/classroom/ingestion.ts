import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import { v5 as uuidv5 } from 'uuid'
import { isIndexableType, isTranscribableType } from '../upload/file-types'
import { parseFileWithPages, type PageOffset } from '../ingestion/parse'
import { chunkText, textForEmbedding } from '../ingestion/chunk'
import { embedBatch } from '../ingestion/embed'
import {
  extractTextFromImage,
  isOcrEligibleType,
  isOcrEnabled,
} from '../ingestion/ocr'
import { OCR_WEAK_CONTENT_MESSAGE } from '../ingestion/ocr-status'
import { transcribeMediaFile, isTranscriptionEnabled } from '../ingestion/transcribe'
import {
  upsertChunks,
  ensureCollection,
  deleteByClassroomDocument,
} from '../vector'
import { downloadToFile } from '../storage'
import { createServiceSupabaseClient } from '../db/server'
import { logger } from '../logger'

const POINT_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const INGESTION_BATCH_SIZE = 32

function makePointId(documentId: string, chunkIndex: number): string {
  return uuidv5(`classroom:${documentId}:${chunkIndex}`, POINT_ID_NAMESPACE)
}

function hashContent(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex')
}

function pageForOffset(pageOffsets: PageOffset[], offset: number): number | undefined {
  let page: number | undefined
  for (const p of pageOffsets) {
    if (p.start <= offset) page = p.page
    else break
  }
  return page
}

export async function runClassroomIngestionPipeline(
  documentId: string,
  r2Key: string,
  fileType: string,
  userId: string,
  classroomId: string,
  filename: string
): Promise<void> {
  const supabase = createServiceSupabaseClient()

  const { data: doc, error: docErr } = await supabase
    .from('classroom_documents')
    .select('id, classroom_id, status')
    .eq('id', documentId)
    .eq('classroom_id', classroomId)
    .single()

  if (docErr || !doc) {
    throw new Error(`Classroom document not found: ${documentId}`)
  }

  await supabase
    .from('classroom_documents')
    .update({ status: 'processing', error_message: null })
    .eq('id', documentId)

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classroom-ingest-'))
  const localPath = path.join(tmpDir, filename)

  try {
    await downloadToFile(r2Key, localPath)

    let fullText = ''
    let pageOffsets: PageOffset[] | null = null

    if (isTranscribableType(fileType) && isTranscriptionEnabled()) {
      const transcript = await transcribeMediaFile(localPath, { documentId, userId })
      fullText = transcript.text
      if (!fullText.trim()) {
        await supabase
          .from('classroom_documents')
          .update({
            status: 'done',
            chunk_count: 0,
            error_message: 'Không có lời thoại trong media',
          })
          .eq('id', documentId)
        return
      }
    } else if (isOcrEligibleType(fileType) && isOcrEnabled()) {
      const ocr = await extractTextFromImage(localPath)
      if (!ocr.usable) {
        await supabase
          .from('classroom_documents')
          .update({
            status: 'done',
            chunk_count: 0,
            error_message: OCR_WEAK_CONTENT_MESSAGE,
          })
          .eq('id', documentId)
        return
      }
      fullText = ocr.text
    } else if (isIndexableType(fileType)) {
      const parsed = await parseFileWithPages(localPath, fileType)
      fullText = parsed.text
      pageOffsets = parsed.pageOffsets ?? null
    } else {
      await supabase
        .from('classroom_documents')
        .update({
          status: 'done',
          chunk_count: 0,
          error_message: 'File type not indexable for RAG',
        })
        .eq('id', documentId)
      return
    }

    const contentHash = hashContent(fullText)
    const chunks = chunkText(fullText)

    await ensureCollection()
    await deleteByClassroomDocument(classroomId, documentId)
    await supabase.from('classroom_document_chunks').delete().eq('document_id', documentId)

    if (chunks.length === 0) {
      await supabase
        .from('classroom_documents')
        .update({
          status: 'done',
          chunk_count: 0,
          content_hash: contentHash,
        })
        .eq('id', documentId)
      return
    }

    let processed = 0
    for (let i = 0; i < chunks.length; i += INGESTION_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INGESTION_BATCH_SIZE)
      const indexedTexts = batch.map((c) => textForEmbedding(filename, c.text))
      const embeddings = await embedBatch(indexedTexts, {
        userId,
        purpose: 'embedding_ingest',
        documentId,
      })

      const pageOf = (chunk: (typeof batch)[0]) =>
        pageOffsets?.length ? pageForOffset(pageOffsets, chunk.start) : undefined

      await upsertChunks(
        batch.map((c, j) => ({
          pointId: makePointId(documentId, c.index),
          vector: embeddings[j]!,
          payload: {
            user_id: userId,
            document_id: documentId,
            filename,
            chunk_index: c.index,
            chunk_text: indexedTexts[j]!,
            classroom_id: classroomId,
            product: 'classroom',
            ...(pageOf(c) !== undefined ? { page: pageOf(c) } : {}),
          },
        }))
      )

      await supabase.from('classroom_document_chunks').insert(
        batch.map((c, j) => ({
          document_id: documentId,
          classroom_id: classroomId,
          chunk_text: indexedTexts[j]!,
          chunk_index: c.index,
          qdrant_point_id: makePointId(documentId, c.index),
          page: pageOf(c) ?? null,
        }))
      )

      processed += batch.length
      await supabase
        .from('classroom_documents')
        .update({ chunk_count: processed })
        .eq('id', documentId)
    }

    await supabase
      .from('classroom_documents')
      .update({
        status: 'done',
        chunk_count: chunks.length,
        content_hash: contentHash,
        error_message: null,
      })
      .eq('id', documentId)

    logger.info('Classroom ingestion done', { documentId, classroomId, chunks: chunks.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Classroom ingestion failed', { err, documentId, classroomId })
    await supabase
      .from('classroom_documents')
      .update({ status: 'failed', error_message: message })
      .eq('id', documentId)
    throw err
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
