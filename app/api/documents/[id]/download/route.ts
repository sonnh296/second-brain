import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createServerSupabaseClient } from '@/lib/db/server'
import { getObjectBuffer, getObjectStream, headObject, uploadBuffer } from '@/lib/storage'
import { isBrowserInlineType, isImageType, mimeForType } from '@/lib/upload/file-types'
import {
  documentThumbnailKey,
  renderImageThumbnail,
} from '@/lib/ingestion/thumbnail'
import { logger } from '@/lib/logger'

function contentDisposition(filename: string, inline: boolean): string {
  const encoded = encodeURIComponent(filename)
  const mode = inline ? 'inline' : 'attachment'
  return `${mode}; filename="${encoded}"; filename*=UTF-8''${encoded}`
}

function isMissingObject(err: unknown): boolean {
  const name = (err as { name?: string }).name
  const message = err instanceof Error ? err.message : String(err)
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    name === '404' ||
    /NoSuchKey|NotFound|specified key does not exist/i.test(message)
  )
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
  const wantThumb = req.nextUrl.searchParams.get('thumb') === '1'

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

  if (wantThumb) {
    if (!isImageType(doc.file_type)) {
      return NextResponse.json({ error: 'Not an image' }, { status: 400 })
    }
    return serveThumbnail(user.id, id, doc.r2_key, doc.filename)
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

async function serveThumbnail(
  userId: string,
  documentId: string,
  r2Key: string,
  filename: string
): Promise<NextResponse> {
  const thumbKey = documentThumbnailKey(userId, documentId)
  const existing = await headObject(thumbKey)
  if (existing) {
    const { stream, contentType } = await getObjectStream(thumbKey)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: thumbnailHeaders(filename, contentType ?? 'image/jpeg'),
    })
  }

  try {
    const { buffer } = await getObjectBuffer(r2Key)
    const thumb = await renderImageThumbnail(buffer)
    await uploadBuffer(thumbKey, thumb, 'image/jpeg')
    return new NextResponse(new Uint8Array(thumb), {
      headers: thumbnailHeaders(filename, 'image/jpeg'),
    })
  } catch (err) {
    if (isMissingObject(err)) {
      return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 })
    }
    logger.warn('Lazy thumbnail generation failed', { err, documentId, userId })
    return NextResponse.json({ error: 'Could not create thumbnail' }, { status: 500 })
  }
}

function thumbnailHeaders(filename: string, contentType: string): HeadersInit {
  return {
    'Content-Type': contentType,
    'Content-Disposition': contentDisposition(`${filename}.thumb.jpg`, true),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
  }
}
