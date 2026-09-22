export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireTeacher } from '@/lib/classroom/acl'
import { restoreClassroomDocument } from '@/lib/classroom/soft-delete'
import { enqueueIngestionJob } from '@/lib/queue'
import { logger } from '@/lib/logger'

type Ctx = { params: Promise<{ id: string; docId: string }> }

/** Restore a soft-deleted classroom document and re-index it. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id, docId } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const result = await restoreClassroomDocument(supabase, id, docId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  if (!result.doc) {
    return NextResponse.json({ error: 'Document not found in trash' }, { status: 404 })
  }

  try {
    await enqueueIngestionJob(
      {
        document_id: result.doc.id,
        r2_key: result.doc.r2_key,
        file_type: result.doc.file_type,
        user_id: user.id,
        classroom_id: id,
        product: 'classroom',
      },
      { force: true }
    )
  } catch (err) {
    logger.error('Classroom restore: reindex queue failed', {
      err,
      documentId: result.doc.id,
      classroomId: id,
    })
  }

  return NextResponse.json({ ok: true, filename: result.doc.filename })
}
