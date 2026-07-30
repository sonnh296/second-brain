import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/db/server'
import { isAdmin } from '@/lib/auth/admin'
import { getAdminSystemStats } from '@/lib/usage/admin-stats'
import { logger } from '@/lib/logger'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const service = createServiceSupabaseClient()
    const stats = await getAdminSystemStats(service)
    return NextResponse.json(stats)
  } catch (error) {
    logger.error('Failed to fetch admin stats', { err: error })
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
