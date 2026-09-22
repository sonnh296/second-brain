export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireTeacher } from '@/lib/classroom/acl'
import { restoreClassroomLesson } from '@/lib/classroom/soft-delete'
import { enqueueIngestionJob } from '@/lib/queue'
import { logger } from '@/lib/logger'

type Ctx = { params: Promise<{ id: string; lessonId: string }> }

/** Restore a soft-deleted lesson and re-index its materials. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id, lessonId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const result = await restoreClassroomLesson(supabase, id, lessonId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  if (result.documentIds && result.documentIds.length > 0) {
    const { data: docs } = await supabase
      .from('classroom_documents')
      .select('id, r2_key, file_type')
      .eq('classroom_id', id)
      .in('id', result.documentIds)

    for (const doc of docs ?? []) {
      try {
        await enqueueIngestionJob(
          {
            document_id: doc.id as string,
            r2_key: doc.r2_key as string,
            file_type: doc.file_type as string,
            user_id: user.id,
            classroom_id: id,
            product: 'classroom',
          },
          { force: true }
        )
      } catch (err) {
        logger.error('Lesson restore: reindex failed', {
          err,
          documentId: doc.id,
          classroomId: id,
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
