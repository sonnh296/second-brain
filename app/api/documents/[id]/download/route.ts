import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createServerSupabaseClient } from '@/lib/db/server'
import { getObjectStream } from '@/lib/storage'
import { isBrowserInlineType, mimeForType } from '@/lib/upload/file-types'

function contentDisposition(filename: string, inline: boolean): string {
  const encoded = encodeURIComponent(filename)
  const mode = inline ? 'inline' : 'attachment'
  return `${mode}; filename="${encoded}"; filename*=UTF-8''${encoded}`
}

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
  const forceDownload = req.nextUrl.searchParams.get('download') === '1'

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
  const mime = mimeForType(doc.file_type)
  const inline =
    !forceDownload && (isBrowserInlineType(doc.file_type) || mime.startsWith('text/'))

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': contentType?.startsWith('application/octet') ? mime : (contentType ?? mime),
      'Content-Disposition': contentDisposition(doc.filename, inline),
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
