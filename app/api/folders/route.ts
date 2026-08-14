import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { MAX_FOLDER_DESCRIPTION_LENGTH } from '@/lib/upload/file-types'

const FOLDER_COLUMNS = 'id, parent_id, name, color, description, created_at, updated_at'

const CreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(MAX_FOLDER_DESCRIPTION_LENGTH).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})

function parseParentId(raw: string | null): string | null {
  if (!raw || raw === 'root' || raw === 'null') return null
  return raw
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (req.nextUrl.searchParams.get('all') === '1') {
    const { data, error } = await supabase
      .from('folders')
      .select(FOLDER_COLUMNS)
      .eq('user_id', user.id)
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 })
    }
    return NextResponse.json(data ?? [])
  }

  const parentId = parseParentId(req.nextUrl.searchParams.get('parent_id'))

  let query = supabase
    .from('folders')
    .select(FOLDER_COLUMNS)
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  query =
    parentId === null
      ? query.is('parent_id', null)
      : query.eq('parent_id', parentId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = CreateFolderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const parentId = parsed.data.parent_id ?? null

  if (parentId) {
    const { data: parent } = await supabase
      .from('folders')
      .select('id')
      .eq('id', parentId)
      .eq('user_id', user.id)
      .single()
    if (!parent) {
      return NextResponse.json({ error: 'Thư mục cha không tồn tại' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: user.id,
      parent_id: parentId,
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      color: parsed.data.color ?? '#f59e0b',
    })
    .select(FOLDER_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Đã có thư mục cùng tên ở vị trí này' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
