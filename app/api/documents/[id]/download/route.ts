import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createServerSupabaseClient } from '@/lib/db/server'
import { getObjectStream } from '@/lib/storage'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: doc } = await supabase
    .from('documents')
    .select('filename, file_type, r2_key')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.file_type === 'note') {
    return NextResponse.json({ error: 'Notes cannot be downloaded as files' }, { status: 400 })
  }

  const { stream, contentType } = await getObjectStream(doc.r2_key)

  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
  }

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': contentType ?? mimeTypes[doc.file_type] ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
    },
  })
}
