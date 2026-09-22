import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteObject } from '@/lib/storage'
import { deleteByClassroomDocument } from '@/lib/vector'
import { logger } from '@/lib/logger'

export type HardDeleteResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

async function purgeClassroomDocumentAssets(
  classroomId: string,
  doc: { id: string; r2_key: string }
): Promise<void> {
  try {
    await deleteByClassroomDocument(classroomId, doc.id)
  } catch (err) {
    logger.error('Qdrant hard delete failed', { err, documentId: doc.id, classroomId })
  }

  if (doc.r2_key && doc.r2_key !== 'pending') {
    await deleteObject(doc.r2_key).catch((err) => {
      logger.error('R2 hard delete failed', {
        err,
        documentId: doc.id,
        classroomId,
        r2Key: doc.r2_key,
      })
    })
  }
}

/** Permanently remove a classroom document (storage + row). */
export async function hardDeleteClassroomDocument(
  supabase: SupabaseClient,
  classroomId: string,
  documentId: string
): Promise<HardDeleteResult> {
  const { data: doc } = await supabase
    .from('classroom_documents')
    .select('id, r2_key')
    .eq('id', documentId)
    .eq('classroom_id', classroomId)
    .single()

  if (!doc) {
    return { ok: false, error: 'Document not found', status: 404 }
  }

  await purgeClassroomDocumentAssets(classroomId, doc)

  await supabase
    .from('classroom_document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('classroom_id', classroomId)

  const { error } = await supabase
    .from('classroom_documents')
    .delete()
    .eq('id', documentId)
    .eq('classroom_id', classroomId)

  if (error) {
    logger.error('Postgres classroom doc hard delete failed', {
      err: error,
      documentId,
      classroomId,
    })
    return { ok: false, error: 'Failed to delete document', status: 500 }
  }

  return { ok: true }
}

/**
 * Permanently delete a lesson: purge all materials' R2/Qdrant, then delete the row
 * (folders + remaining docs cascade; assignments cascade).
 */
export async function hardDeleteClassroomLesson(
  supabase: SupabaseClient,
  classroomId: string,
  lessonId: string
): Promise<HardDeleteResult> {
  const { data: lesson } = await supabase
    .from('classroom_lessons')
    .select('id')
    .eq('id', lessonId)
    .eq('classroom_id', classroomId)
    .single()

  if (!lesson) {
    return { ok: false, error: 'Lesson not found', status: 404 }
  }

  const { data: folders } = await supabase
    .from('classroom_folders')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('classroom_id', classroomId)

  const folderIds = (folders ?? []).map((f) => f.id as string)
  if (folderIds.length > 0) {
    const { data: docs } = await supabase
      .from('classroom_documents')
      .select('id, r2_key')
      .eq('classroom_id', classroomId)
      .in('folder_id', folderIds)

    for (const d of docs ?? []) {
      await purgeClassroomDocumentAssets(classroomId, {
        id: d.id as string,
        r2_key: d.r2_key as string,
      })
    }
  }

  const { error } = await supabase
    .from('classroom_lessons')
    .delete()
    .eq('id', lessonId)
    .eq('classroom_id', classroomId)

  if (error) {
    logger.error('Lesson hard delete failed', { err: error, lessonId, classroomId })
    return { ok: false, error: 'Failed to delete lesson', status: 500 }
  }

  return { ok: true }
}
