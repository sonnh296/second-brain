import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'

const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})

async function wouldCreateCycle(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  folderId: string,
  newParentId: string | null,
  userId: string
): Promise<boolean> {
  if (!newParentId) return false
  if (newParentId === folderId) return true

  let current: string | null = newParentId
  const visited = new Set<string>()

  while (current) {
    if (current === folderId) return true
    if (visited.has(current)) return true
    visited.add(current)

    const { data } = await supabase
      .from('folders')
      .select('parent_id')
      .eq('id', current)
      .eq('user_id', userId)
      .single()

    current = data?.parent_id ?? null
  }

  return false
}

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

  const { id } = await params

  const { data: folder } = await supabase
    .from('folders')
    .select('id, parent_id, name, color, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  }

  const breadcrumb: { id: string; name: string }[] = []
  let currentId: string | null = folder.id

  while (currentId) {
    const { data: node } = await supabase
      .from('folders')
      .select('id, name, parent_id')
      .eq('id', currentId)
      .eq('user_id', user.id)
      .single()

    if (!node) break
    breadcrumb.unshift({ id: node.id, name: node.name })
    currentId = node.parent_id
  }

  return NextResponse.json({ folder, breadcrumb })
}

export async function PATCH(
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
  const body = await req.json().catch(() => null)
  const parsed = UpdateFolderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.color !== undefined) updates.color = parsed.data.color

  if (parsed.data.parent_id !== undefined) {
    if (parsed.data.parent_id) {
      const { data: parent } = await supabase
        .from('folders')
        .select('id')
        .eq('id', parsed.data.parent_id)
        .eq('user_id', user.id)
        .single()
      if (!parent) {
        return NextResponse.json({ error: 'Thư mục cha không tồn tại' }, { status: 400 })
      }
      const cycle = await wouldCreateCycle(supabase, id, parsed.data.parent_id, user.id)
      if (cycle) {
        return NextResponse.json({ error: 'Không thể di chuyển thư mục vào chính nó hoặc thư mục con' }, { status: 400 })
      }
    }
    updates.parent_id = parsed.data.parent_id
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('folders')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, parent_id, name, color, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Đã có thư mục cùng tên ở vị trí này' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
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

  const { id } = await params

  const { error } = await supabase.from('folders').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
