import type { SupabaseClient } from '@supabase/supabase-js'

export async function createClassroomWithDefaults(
  supabase: SupabaseClient,
  _userId: string,
  name: string
): Promise<{ classroom: { id: string; name: string; join_code: string }; error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) {
    return { classroom: null as never, error: 'Tên lớp không hợp lệ' }
  }

  const { data, error } = await supabase.rpc('create_classroom', {
    p_name: trimmed,
  })

  if (error) {
    return { classroom: null as never, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) {
    return { classroom: null as never, error: 'Failed to create classroom' }
  }

  return {
    classroom: {
      id: row.id as string,
      name: row.name as string,
      join_code: row.join_code as string,
    },
  }
}

export async function createLesson(
  supabase: SupabaseClient,
  classroomId: string
): Promise<{ lesson: { id: string; lesson_index: number; title: string }; error?: string }> {
  const { data, error } = await supabase.rpc('create_classroom_lesson', {
    p_classroom_id: classroomId,
  })

  if (error) {
    return { lesson: null as never, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) {
    return { lesson: null as never, error: 'Failed to create lesson' }
  }

  return {
    lesson: {
      id: row.id as string,
      lesson_index: row.lesson_index as number,
      title: row.title as string,
    },
  }
}
