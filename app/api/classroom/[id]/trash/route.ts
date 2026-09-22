export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireTeacher } from '@/lib/classroom/acl'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Teacher trash: soft-deleted lessons + soft-deleted documents that are not
 * nested under a soft-deleted lesson (those restore with the lesson).
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const [{ data: lessons }, { data: folders }, { data: docs }] = await Promise.all([
    supabase
      .from('classroom_lessons')
      .select('id, lesson_index, title, deleted_at, created_at')
      .eq('classroom_id', id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    supabase
      .from('classroom_folders')
      .select('id, kind, lesson_id')
      .eq('classroom_id', id),
    supabase
      .from('classroom_documents')
      .select(
        'id, filename, file_type, file_size_bytes, status, folder_id, deleted_at, created_at'
      )
      .eq('classroom_id', id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ])

  const deletedLessonIds = new Set((lessons ?? []).map((l) => l.id as string))
  const folderById = new Map(
    (folders ?? []).map((f) => [
      f.id as string,
      f as { id: string; kind: string; lesson_id: string | null },
    ])
  )

  const documents = (docs ?? []).filter((d) => {
    const folder = folderById.get(d.folder_id as string)
    if (!folder) return true
    if (folder.lesson_id && deletedLessonIds.has(folder.lesson_id)) return false
    return true
  })

  return NextResponse.json({
    lessons: lessons ?? [],
    documents,
  })
}
