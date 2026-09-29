import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { normalizePlanRow } from '@/lib/plans/types'
import { logger } from '@/lib/logger'

/** Active plans for Settings upgrade tab (authenticated users). */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    logger.warn('Public plans list failed', { err: error.message })
    if (error.code === '42P01' || error.message?.includes('subscription_plans')) {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }

  return NextResponse.json((data ?? []).map((row) => normalizePlanRow(row as Record<string, unknown>)))
}
