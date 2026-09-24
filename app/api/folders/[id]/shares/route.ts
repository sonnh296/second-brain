import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/db/server'
import {
  assertFolderOwned,
  listFolderShares,
  resolveShareGrantee,
} from '@/lib/folders/shares'

const InviteSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: folderId } = await params
  const folder = await assertFolderOwned(supabase, folderId, user.id)
  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  }

  try {
    const shares = await listFolderShares(supabase, folderId, user.id)
    return NextResponse.json({ folder, shares })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list shares'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
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

  const { id: folderId } = await params
  const folder = await assertFolderOwned(supabase, folderId, user.id)
  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = InviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const service = createServiceSupabaseClient()
  let grantee: { id: string; username: string | null } | null
  try {
    grantee = await resolveShareGrantee(service, parsed.data.identifier)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (!grantee) {
    return NextResponse.json(
      { error: 'Không tìm thấy người dùng. Dùng tên đăng nhập hoặc email.' },
      { status: 404 }
    )
  }

  if (grantee.id === user.id) {
    return NextResponse.json({ error: 'Không thể chia sẻ với chính bạn' }, { status: 400 })
  }

  const { data: share, error } = await supabase
    .from('folder_shares')
    .insert({
      folder_id: folderId,
      owner_id: user.id,
      grantee_id: grantee.id,
      permission: 'viewer',
    })
    .select('id, folder_id, owner_id, grantee_id, permission, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Đã chia sẻ với người này rồi' }, { status: 409 })
    }
    if (error.message?.includes('folder_shares') || error.code === '42P01') {
      return NextResponse.json(
        { error: 'Chưa chạy migration chia sẻ thư mục (015)' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Failed to share folder' }, { status: 500 })
  }

  return NextResponse.json(
    {
      ...share,
      grantee_username: grantee.username,
    },
    { status: 201 }
  )
}
