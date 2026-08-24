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

/** Parse `bytes=start-end` / `bytes=start-`. Returns null if malformed. */
function parseBytesRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match) return null

  const startRaw = match[1]
  const endRaw = match[2]
  if (!startRaw && !endRaw) return null

  let start: number
  let end: number

  if (!startRaw) {
    // suffix: bytes=-N → last N bytes
    const suffix = parseInt(endRaw, 10)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = parseInt(startRaw, 10)
    end = endRaw ? parseInt(endRaw, 10) : size - 1
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  }

  if (start < 0 || end < start || start >= size) return null
  end = Math.min(end, size - 1)
  return { start, end }
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

  const mime = mimeForType(doc.file_type)
  const inline =
    !forceDownload && (isBrowserInlineType(doc.file_type) || mime.startsWith('text/'))

  const meta = await headObject(doc.r2_key)
  const size = meta?.size ?? 0
  const rangeHeader = req.headers.get('range')
  const range = parseBytesRange(rangeHeader, size)

  if (rangeHeader && size > 0 && !range) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${size}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  const ranged = Boolean(range)
  const { stream, contentType, contentLength, contentRange } = await getObjectStream(
    doc.r2_key,
    ranged ? { range: `bytes=${range!.start}-${range!.end}` } : undefined
  )

  const resolvedType = contentType?.startsWith('application/octet')
    ? mime
    : (contentType ?? mime)

  const headers: Record<string, string> = {
    'Content-Type': resolvedType,
    'Content-Disposition': contentDisposition(doc.filename, inline),
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  }

  if (ranged && range) {
    headers['Content-Range'] =
      contentRange ?? `bytes ${range.start}-${range.end}/${size}`
    headers['Content-Length'] = String(
      contentLength ?? range.end - range.start + 1
    )
  } else if (size > 0) {
    headers['Content-Length'] = String(contentLength ?? size)
  }

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: ranged ? 206 : 200,
    headers,
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
