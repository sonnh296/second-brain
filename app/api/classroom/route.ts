export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { createClassroomWithDefaults } from '@/lib/classroom/create'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberships, error } = await supabase
    .from('classroom_members')
    .select('role, classroom_id, classrooms(id, name, join_code, created_at, archived_at)')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const teaching = []
  const learning = []
  for (const m of memberships ?? []) {
    const c = m.classrooms as unknown as {
      id: string
      name: string
      join_code: string
      created_at: string
      archived_at: string | null
    } | null
    if (!c || c.archived_at) continue
    const row = { ...c, role: m.role as 'teacher' | 'student' }
    if (m.role === 'teacher') teaching.push(row)
    else learning.push(row)
  }

  return NextResponse.json({ teaching, learning })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name || name.length > 120) {
    return NextResponse.json({ error: 'Tên lớp không hợp lệ' }, { status: 400 })
  }

  const result = await createClassroomWithDefaults(supabase, user.id, name)
  if (result.error || !result.classroom) {
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })
  }

  return NextResponse.json(result.classroom, { status: 201 })
}
