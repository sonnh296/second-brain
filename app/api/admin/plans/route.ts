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
  return { user, service: createServiceSupabaseClient() }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { data, error } = await auth.service
    .from('subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    logger.error('Admin plans list failed', { err: error.message })
    if (error.code === '42P01' || error.message?.includes('subscription_plans')) {
      return NextResponse.json(
        { error: 'Cần chạy migration 018_subscription_plans.sql trên Supabase.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }

  return NextResponse.json((data ?? []).map((row) => normalizePlanRow(row as Record<string, unknown>)))
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PlanUpsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  const { data, error } = await auth.service
    .from('subscription_plans')
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      price_display: input.price_display,
      price_monthly_vnd: input.price_monthly_vnd ?? 0,
      storage_limit_bytes: input.storage_limit_bytes ?? null,
      documents_limit: input.documents_limit ?? null,
      features: input.features ?? [],
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .select('*')
    .single()

  if (error) {
    logger.error('Admin plan create failed', { err: error.message })
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Slug đã tồn tại' }, { status: 409 })
    }
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Cần chạy migration 018_subscription_plans.sql trên Supabase.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }

  return NextResponse.json(normalizePlanRow(data as Record<string, unknown>), { status: 201 })
}
