import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createServerSupabaseClient } from '@/lib/db/server'
import { getObjectStream } from '@/lib/storage'

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

  const { data: attachment } = await supabase
    .from('message_attachments')
    .select('id, filename, media_type, r2_key, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const { stream, contentType } = await getObjectStream(attachment.r2_key)
  const mime = attachment.media_type || contentType || 'application/octet-stream'

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': contentDisposition(attachment.filename, !forceDownload),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
