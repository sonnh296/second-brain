import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/db/server'
import { isAdmin } from '@/lib/auth/admin'
import { logger } from '@/lib/logger'
import { normalizePlanRow, PlanUpsertSchema } from '@/lib/plans/types'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.id))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { service: createServiceSupabaseClient() }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PlanUpsertSchema.partial().safeParse(body)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.description === undefined) {
    // keep as-is
  }

  const { data, error } = await auth.service
    .from('subscription_plans')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    logger.error('Admin plan update failed', { err: error.message, id })
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Slug đã tồn tại' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(normalizePlanRow(data as Record<string, unknown>))
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const { id } = await params

  const { error } = await auth.service.from('subscription_plans').delete().eq('id', id)
  if (error) {
    logger.error('Admin plan delete failed', { err: error.message, id })
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
