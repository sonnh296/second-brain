import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteByClassroomDocument } from '@/lib/vector'
import { logger } from '@/lib/logger'

export type SoftDeleteResult =
  | { ok: true; already_trashed?: boolean }
  | { ok: false; error: string; status: number }

/**
 * Move a classroom document to trash: set deleted_at and strip search indexes.
 * R2 object is kept until permanent delete.
 */
export async function softDeleteClassroomDocument(
  supabase: SupabaseClient,
  classroomId: string,
  documentId: string
): Promise<SoftDeleteResult> {
  const { data: doc } = await supabase
    .from('classroom_documents')
    .select('id, deleted_at')
    .eq('id', documentId)
    .eq('classroom_id', classroomId)
    .single()

  if (!doc) {
    return { ok: false, error: 'Document not found', status: 404 }
  }

  if (doc.deleted_at) {
    return { ok: true, already_trashed: true }
  }

  const { error } = await supabase
    .from('classroom_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('classroom_id', classroomId)

  if (error) {
    logger.error('Classroom soft delete failed', { err: error, documentId, classroomId })
    return { ok: false, error: 'Failed to move document to trash', status: 500 }
  }

  try {
    await deleteByClassroomDocument(classroomId, documentId)
  } catch (err) {
    logger.error('Qdrant cleanup on classroom soft delete failed', {
      err,
      documentId,
      classroomId,
    })
  }

  const { error: chunkErr } = await supabase
    .from('classroom_document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('classroom_id', classroomId)

  if (chunkErr) {
    logger.error('Chunk cleanup on classroom soft delete failed', {
      err: chunkErr,
      documentId,
      classroomId,
    })
  }

  return { ok: true }
}

/**
 * Soft-delete a lesson and cascade to its materials + assignments.
 * Children share the same deleted_at timestamp so restore can scope correctly.
 */
export async function softDeleteClassroomLesson(
  supabase: SupabaseClient,
  classroomId: string,
  lessonId: string
): Promise<SoftDeleteResult> {
  const { data: lesson } = await supabase
    .from('classroom_lessons')
    .select('id, deleted_at')
    .eq('id', lessonId)
    .eq('classroom_id', classroomId)
    .single()

  if (!lesson) {
    return { ok: false, error: 'Lesson not found', status: 404 }
  }

  if (lesson.deleted_at) {
    return { ok: true, already_trashed: true }
  }

  const now = new Date().toISOString()

  const { error: lessonErr } = await supabase
    .from('classroom_lessons')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', lessonId)
    .eq('classroom_id', classroomId)

  if (lessonErr) {
    logger.error('Lesson soft delete failed', { err: lessonErr, lessonId, classroomId })
    return { ok: false, error: 'Failed to move lesson to trash', status: 500 }
  }

  await supabase
    .from('assignments')
    .update({ deleted_at: now, updated_at: now })
    .eq('lesson_id', lessonId)
    .eq('classroom_id', classroomId)
    .is('deleted_at', null)

  const { data: folders } = await supabase
    .from('classroom_folders')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('classroom_id', classroomId)

  const folderIds = (folders ?? []).map((f) => f.id as string)
  if (folderIds.length > 0) {
    const { data: docs } = await supabase
      .from('classroom_documents')
      .select('id')
      .eq('classroom_id', classroomId)
      .in('folder_id', folderIds)
      .is('deleted_at', null)

    for (const d of docs ?? []) {
      const docId = d.id as string
      const { error } = await supabase
        .from('classroom_documents')
        .update({ deleted_at: now })
        .eq('id', docId)
        .eq('classroom_id', classroomId)

      if (error) {
        logger.error('Classroom soft delete failed', { err: error, documentId: docId, classroomId })
        continue
      }

      try {
        await deleteByClassroomDocument(classroomId, docId)
      } catch (err) {
        logger.error('Qdrant cleanup on classroom soft delete failed', {
          err,
          documentId: docId,
          classroomId,
        })
      }

      await supabase
        .from('classroom_document_chunks')
        .delete()
        .eq('document_id', docId)
        .eq('classroom_id', classroomId)
    }
  }

  return { ok: true }
}

export async function restoreClassroomDocument(
  supabase: SupabaseClient,
  classroomId: string,
  documentId: string
): Promise<
  SoftDeleteResult & {
    doc?: { id: string; filename: string; file_type: string; r2_key: string }
  }
> {
  const { data: doc } = await supabase
    .from('classroom_documents')
    .select('id, filename, file_type, r2_key, deleted_at, folder_id')
    .eq('id', documentId)
    .eq('classroom_id', classroomId)
    .single()

  if (!doc || !doc.deleted_at) {
    return { ok: false, error: 'Document not found in trash', status: 404 }
  }

  // Block restore into a soft-deleted lesson folder.
  const { data: folder } = await supabase
    .from('classroom_folders')
    .select('id, lesson_id')
    .eq('id', doc.folder_id)
    .eq('classroom_id', classroomId)
    .maybeSingle()

  if (folder?.lesson_id) {
    const { data: lesson } = await supabase
      .from('classroom_lessons')
      .select('id, deleted_at')
      .eq('id', folder.lesson_id)
      .single()
    if (lesson?.deleted_at) {
      return {
        ok: false,
        error: 'Khôi phục buổi học trước khi khôi phục tài liệu',
        status: 400,
      }
    }
  }

  const { error } = await supabase
    .from('classroom_documents')
    .update({
      deleted_at: null,
      status: 'pending',
      chunk_count: null,
      error_message: null,
    })
    .eq('id', documentId)
    .eq('classroom_id', classroomId)

  if (error) {
    return { ok: false, error: 'Failed to restore document', status: 500 }
  }

  return {
    ok: true,
    doc: {
      id: doc.id,
      filename: doc.filename,
      file_type: doc.file_type,
      r2_key: doc.r2_key,
    },
  }
}

export async function restoreClassroomLesson(
  supabase: SupabaseClient,
  classroomId: string,
  lessonId: string
): Promise<SoftDeleteResult & { documentIds?: string[] }> {
  const { data: lesson } = await supabase
    .from('classroom_lessons')
    .select('id, deleted_at')
    .eq('id', lessonId)
    .eq('classroom_id', classroomId)
    .single()

  if (!lesson || !lesson.deleted_at) {
    return { ok: false, error: 'Lesson not found in trash', status: 404 }
  }

  const cascadeAt = lesson.deleted_at
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('classroom_lessons')
    .update({ deleted_at: null, updated_at: now })
    .eq('id', lessonId)
    .eq('classroom_id', classroomId)

  if (error) {
    return { ok: false, error: 'Failed to restore lesson', status: 500 }
  }

  // Only restore children soft-deleted together with this lesson.
  await supabase
    .from('assignments')
    .update({ deleted_at: null, updated_at: now })
    .eq('lesson_id', lessonId)
    .eq('classroom_id', classroomId)
    .eq('deleted_at', cascadeAt)

  const { data: folders } = await supabase
    .from('classroom_folders')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('classroom_id', classroomId)

  const folderIds = (folders ?? []).map((f) => f.id as string)
  const documentIds: string[] = []

  if (folderIds.length > 0) {
    const { data: docs } = await supabase
      .from('classroom_documents')
      .select('id')
      .eq('classroom_id', classroomId)
      .in('folder_id', folderIds)
      .eq('deleted_at', cascadeAt)

    for (const d of docs ?? []) {
      const restored = await restoreClassroomDocument(supabase, classroomId, d.id as string)
      if (restored.ok && restored.doc) documentIds.push(restored.doc.id)
    }
  }

  return { ok: true, documentIds }
}
