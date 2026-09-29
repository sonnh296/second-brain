import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/db/server'
import { getProfileStats } from '@/lib/usage/stats'
import { logger } from '@/lib/logger'

const PatchSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional(),
  personalization_enabled: z.boolean().optional(),
})

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await getProfileStats(supabase, user.id)
    return NextResponse.json(stats)
  } catch (err) {
    logger.error('Profile stats failed', { err, userId: user.id })
    return NextResponse.json({ error: 'Failed to load profile stats' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.display_name !== undefined) {
    const name = parsed.data.display_name?.trim() || null
    updates.display_name = name
  }
  if (parsed.data.personalization_enabled !== undefined) {
    updates.personalization_enabled = parsed.data.personalization_enabled
    updates.personalization_consent_at = parsed.data.personalization_enabled
      ? new Date().toISOString()
      : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
  if (error) {
    logger.error('Profile update failed', { err: error.message, userId: user.id })
    if (error.code === '42703' || error.message?.includes('personalization') || error.message?.includes('display_name')) {
      return NextResponse.json(
        { error: 'Cần chạy migration 017_profile_settings.sql trên Supabase.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Không cập nhật được hồ sơ' }, { status: 500 })
  }

  try {
    const stats = await getProfileStats(supabase, user.id)
    return NextResponse.json(stats)
  } catch (err) {
    logger.error('Profile reload after patch failed', { err, userId: user.id })
    return NextResponse.json({ ok: true })
  }
}
