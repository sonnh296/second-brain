import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createServerSupabaseClient } from '@/lib/db/server'
import { getObjectStream, headObject } from '@/lib/storage'
import { mimeForType } from '@/lib/upload/file-types'
import { isTransientAuthError } from '@/lib/auth/session'
import {
  isNoteImageKind,
  NOTE_IMAGE_EXT,
  noteImageR2Key,
} from '@/lib/notes/images'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|gif|webp)$/i

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ kind: string; scopeId: string; filename: string }>
  }
) {
  let user: { id: string } | null = null
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  try {
    supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()
    if (error && isTransientAuthError(error)) {
      return NextResponse.json(
        {
          error: 'Không kết nối được máy chủ xác thực. Thử lại sau giây lát.',
          code: 'auth_unavailable',
        },
        { status: 503 }
      )
    }
    user = data.user
  } catch (err) {
    if (isTransientAuthError(err)) {
      return NextResponse.json(
        {
          error: 'Không kết nối được máy chủ xác thực. Thử lại sau giây lát.',
          code: 'auth_unavailable',
        },
        { status: 503 }
      )
    }
    throw err
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { kind, scopeId, filename } = await params
  if (!isNoteImageKind(kind) || !UUID_RE.test(scopeId) || !FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (!NOTE_IMAGE_EXT.has(ext === 'jpeg' ? 'jpg' : ext) && !NOTE_IMAGE_EXT.has(ext)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (kind === 'n') {
    const { data: doc } = await supabase
      .from('documents')
      .select('id')
      .eq('id', scopeId)
      .eq('user_id', user.id)
      .eq('file_type', 'note')
      .maybeSingle()
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const r2Key = noteImageR2Key(user.id, kind, scopeId, filename)
  const meta = await headObject(r2Key)
  if (!meta) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { stream, contentType } = await getObjectStream(r2Key)
  const mime =
    contentType ||
    mimeForType(ext === 'jpeg' || ext === 'jpg' ? 'jpg' : (ext as 'png' | 'gif' | 'webp'))

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(meta.size),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
