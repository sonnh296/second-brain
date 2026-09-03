import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { uploadBuffer } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'
import { mimeForType } from '@/lib/upload/file-types'
import { isTransientAuthError } from '@/lib/auth/session'
import { logger } from '@/lib/logger'
import {
  isNoteImageKind,
  MAX_NOTE_IMAGE_BYTES,
  NOTE_IMAGE_EXT,
  noteImagePublicSrc,
  noteImageR2Key,
} from '@/lib/notes/images'

const MetaSchema = z.object({
  kind: z.string(),
  scope_id: z.string().uuid(),
})

function extFromFile(file: File): string | null {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (NOTE_IMAGE_EXT.has(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  return mimeMap[file.type] ?? null
}

async function requireUser() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()
    if (error && isTransientAuthError(error)) {
      return {
        error: NextResponse.json(
          {
            error: 'Không kết nối được máy chủ xác thực. Thử lại sau giây lát.',
            code: 'auth_unavailable',
          },
          { status: 503 }
        ),
      } as const
    }
    if (!data.user) {
      return {
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      } as const
    }
    return { user: data.user, supabase } as const
  } catch (err) {
    if (isTransientAuthError(err)) {
      logger.warn('Note image auth transient failure', { err })
      return {
        error: NextResponse.json(
          {
            error: 'Không kết nối được máy chủ xác thực. Thử lại sau giây lát.',
            code: 'auth_unavailable',
          },
          { status: 503 }
        ),
      } as const
    }
    throw err
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const rl = await checkRateLimit(user.id, 'upload', 30, 3600, { failClosed: true })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many uploads. Please wait.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const parsed = MetaSchema.safeParse({
    kind: String(form.get('kind') ?? ''),
    scope_id: String(form.get('scope_id') ?? ''),
  })
  if (!parsed.success || !isNoteImageKind(parsed.data.kind)) {
    return NextResponse.json({ error: 'Invalid kind or scope_id' }, { status: 400 })
  }

  const { kind, scope_id: scopeId } = parsed.data
  const ext = extFromFile(file)
  if (!ext) {
    return NextResponse.json(
      { error: 'Chỉ hỗ trợ ảnh PNG, JPG, GIF, WebP' },
      { status: 400 }
    )
  }

  if (file.size <= 0 || file.size > MAX_NOTE_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Ảnh quá lớn (tối đa ${MAX_NOTE_IMAGE_BYTES / (1024 * 1024)} MB)` },
      { status: 413 }
    )
  }

  if (kind === 'n') {
    const { data: doc } = await supabase
      .from('documents')
      .select('id')
      .eq('id', scopeId)
      .eq('user_id', user.id)
      .eq('file_type', 'note')
      .is('deleted_at', null)
      .maybeSingle()
    if (!doc) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
  }

  const imageId = randomUUID()
  const filename = `${imageId}.${ext}`
  const r2Key = noteImageR2Key(user.id, kind, scopeId, filename)
  const contentType = mimeForType(ext === 'jpg' ? 'jpg' : ext)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadBuffer(r2Key, buffer, contentType)
  } catch (err) {
    logger.error('Note image upload failed', { err, userId: user.id, r2Key })
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const src = noteImagePublicSrc(kind, scopeId, filename)
  logger.info('Note image uploaded', {
    userId: user.id,
    kind,
    scopeId,
    filename,
    size: file.size,
  })

  return NextResponse.json({ src, filename }, { status: 201 })
}
