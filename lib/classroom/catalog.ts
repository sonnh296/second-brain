import type { SupabaseClient } from '@supabase/supabase-js'

export type ClassroomDocRef = {
  id: string
  filename: string
  file_type: string
  status: string
  folder_kind: 'shared_pinned' | 'lesson_materials' | string
  lesson_id: string | null
  lesson_index: number | null
  lesson_title: string | null
}

export type ClassroomCatalog = {
  shared: ClassroomDocRef[]
  lessons: {
    id: string
    lesson_index: number
    title: string
    documents: ClassroomDocRef[]
  }[]
}

/** Match "buổi 3", "buoi 3", "lesson 3", "bài 3" (lesson index). */
export function parseLessonIndexFromQuery(query: string): number | null {
  const q = query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

  const patterns = [
    /\bbuoi\s*(?:hoc\s*)?(\d{1,3})\b/,
    /\blesson\s*(\d{1,3})\b/,
    /\bbai\s*(?:hoc\s*)?(\d{1,3})\b/,
    /\bsession\s*(\d{1,3})\b/,
  ]
  for (const re of patterns) {
    const m = q.match(re)
    if (m) {
      const n = Number.parseInt(m[1]!, 10)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

export async function loadClassroomCatalog(
  supabase: SupabaseClient,
  classroomId: string
): Promise<ClassroomCatalog> {
  const [{ data: lessons }, { data: folders }, { data: docs }] = await Promise.all([
    supabase
      .from('classroom_lessons')
      .select('id, lesson_index, title')
      .eq('classroom_id', classroomId)
      .is('deleted_at', null)
      .order('lesson_index', { ascending: true }),
    supabase
      .from('classroom_folders')
      .select('id, kind, lesson_id')
      .eq('classroom_id', classroomId),
    supabase
      .from('classroom_documents')
      .select('id, filename, file_type, status, folder_id')
      .eq('classroom_id', classroomId)
      .is('deleted_at', null)
      .eq('status', 'done'),
  ])

  const folderById = new Map(
    (folders ?? []).map((f) => [f.id as string, f as { id: string; kind: string; lesson_id: string | null }])
  )
  const lessonById = new Map(
    (lessons ?? []).map((l) => [
      l.id as string,
      l as { id: string; lesson_index: number; title: string },
    ])
  )

  const shared: ClassroomDocRef[] = []
  const byLesson = new Map<string, ClassroomDocRef[]>()

  for (const raw of docs ?? []) {
    const folder = folderById.get(raw.folder_id as string)
    if (!folder) continue
    const lesson = folder.lesson_id ? lessonById.get(folder.lesson_id) : null
    const ref: ClassroomDocRef = {
      id: raw.id as string,
      filename: raw.filename as string,
      file_type: raw.file_type as string,
      status: raw.status as string,
      folder_kind: folder.kind,
      lesson_id: folder.lesson_id,
      lesson_index: lesson?.lesson_index ?? null,
      lesson_title: lesson?.title ?? null,
    }
    if (folder.kind === 'shared_pinned' || !folder.lesson_id) {
      shared.push(ref)
    } else {
      const list = byLesson.get(folder.lesson_id) ?? []
      list.push(ref)
      byLesson.set(folder.lesson_id, list)
    }
  }

  return {
    shared,
    lessons: (lessons ?? []).map((l) => ({
      id: l.id as string,
      lesson_index: l.lesson_index as number,
      title: l.title as string,
      documents: byLesson.get(l.id as string) ?? [],
    })),
  }
}

export function formatClassroomCatalog(catalog: ClassroomCatalog): string {
  const lines: string[] = []
  if (catalog.shared.length > 0) {
    lines.push(
      `Tài liệu chung: ${catalog.shared.map((d) => d.filename).join(', ')}`
    )
  } else {
    lines.push('Tài liệu chung: (trống)')
  }
  for (const lesson of catalog.lessons) {
    const label = lesson.title?.trim() || `Buổi ${lesson.lesson_index}`
    if (lesson.documents.length === 0) {
      lines.push(`${label}: (chưa có tài liệu)`)
    } else {
      lines.push(
        `${label}: ${lesson.documents.map((d) => d.filename).join(', ')}`
      )
    }
  }
  if (catalog.lessons.length === 0) {
    lines.push('Chưa có buổi học nào.')
  }
  return lines.join('\n')
}

export function resolveLessonDocumentIds(
  catalog: ClassroomCatalog,
  lessonIndex: number
): {
  lessonTitle: string
  documentIds: string[]
  filenames: string[]
  documents: ClassroomDocRef[]
} | null {
  const lesson = catalog.lessons.find((l) => l.lesson_index === lessonIndex)
  if (!lesson) return null
  return {
    lessonTitle: lesson.title?.trim() || `Buổi ${lesson.lesson_index}`,
    documentIds: lesson.documents.map((d) => d.id),
    filenames: lesson.documents.map((d) => d.filename),
    documents: lesson.documents,
  }
}
