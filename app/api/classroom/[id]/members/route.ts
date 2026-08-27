export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAclError, requireTeacher } from '@/lib/classroom/acl'

type Ctx = { params: Promise<{ id: string }> }

/** Kick a student from the classroom (teacher only). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await requireTeacher(supabase, id, user.id)
  if (isAclError(membership)) {
    return NextResponse.json({ error: membership.error }, { status: membership.status })
  }

  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
  }

  const { error } = await supabase
    .from('classroom_members')
    .delete()
    .eq('classroom_id', id)
    .eq('user_id', userId)
    .eq('role', 'student')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Leave classroom (self). */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: mine } = await supabase
    .from('classroom_members')
    .select('role')
    .eq('classroom_id', id)
    .eq('user_id', user.id)
    .single()

  if (!mine) return NextResponse.json({ error: 'Not a member' }, { status: 404 })
  if (mine.role === 'teacher') {
    return NextResponse.json(
      { error: 'Giáo viên không thể rời lớp — hãy xóa hoặc lưu trữ lớp' },
      { status: 400 }
    )
  }

  await supabase
    .from('classroom_members')
    .delete()
    .eq('classroom_id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
