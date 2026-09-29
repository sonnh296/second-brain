import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { deleteObject, getObjectBuffer, uploadBuffer } from '@/lib/storage'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function avatarKey(userId: string, ext: string): string {
  return `avatars/${userId}/avatar.${ext}`
}

function extForMime(mime: string): string | null {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return null
}

async function requireUser() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { user, supabase }
}

/** Stream the current user's avatar from R2. */
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('avatar_r2_key')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    if (error.code === '42703') {
      return NextResponse.json({ error: 'Avatar not configured' }, { status: 404 })
    }
    logger.error('Avatar profile read failed', { err: error.message, userId: user.id })
    return NextResponse.json({ error: 'Failed to load avatar' }, { status: 500 })
  }

  const key = profile?.avatar_r2_key as string | null | undefined
  if (!key) {
    return NextResponse.json({ error: 'No avatar' }, { status: 404 })
  }

  try {
    const { buffer, contentType } = await getObjectBuffer(key)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType ?? 'image/jpeg',
        // Short private cache; client busts with ?cb= after uploads.
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600',
      },
    })
  } catch (err) {
    logger.error('Avatar R2 read failed', { err, userId: user.id, key })
    return NextResponse.json({ error: 'Avatar missing' }, { status: 404 })
  }
}

/** Upload / replace avatar (multipart form field "file"). */
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

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
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Chỉ hỗ trợ JPEG, PNG, WebP, GIF' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: 'Ảnh tối đa 2MB' }, { status: 400 })
  }

  const ext = extForMime(file.type)
  if (!ext) {
    return NextResponse.json({ error: 'Định dạng không hỗ trợ' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('avatar_r2_key')
    .eq('id', user.id)
    .maybeSingle()

  const prevKey = (existing?.avatar_r2_key as string | null) ?? null
  const key = avatarKey(user.id, ext)
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await uploadBuffer(key, buffer, file.type)
  } catch (err) {
    logger.error('Avatar upload failed', { err, userId: user.id })
    return NextResponse.json({ error: 'Không tải lên được ảnh' }, { status: 500 })
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_r2_key: key })
    .eq('id', user.id)

  if (updateErr) {
    logger.error('Avatar key update failed', { err: updateErr.message, userId: user.id })
    if (updateErr.code === '42703') {
      return NextResponse.json(
        { error: 'Cần chạy migration 017_profile_settings.sql trên Supabase.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Không lưu được avatar' }, { status: 500 })
  }

  if (prevKey && prevKey !== key) {
    try {
      await deleteObject(prevKey)
    } catch (err) {
      logger.warn('Old avatar delete failed', { err, userId: user.id, prevKey })
    }
  }

  return NextResponse.json({
    avatar_url: `/api/profile/avatar?cb=${Date.now()}`,
  })
}

/** Remove avatar. */
export async function DELETE() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const { data: existing } = await supabase
    .from('profiles')
    .select('avatar_r2_key')
    .eq('id', user.id)
    .maybeSingle()

  const prevKey = (existing?.avatar_r2_key as string | null) ?? null

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_r2_key: null })
    .eq('id', user.id)

  if (error) {
    logger.error('Avatar clear failed', { err: error.message, userId: user.id })
    return NextResponse.json({ error: 'Không xóa được avatar' }, { status: 500 })
  }

  if (prevKey) {
    try {
      await deleteObject(prevKey)
    } catch (err) {
      logger.warn('Avatar R2 delete failed', { err, userId: user.id, prevKey })
    }
  }

  return NextResponse.json({ ok: true })
}
