import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAdmin } from '@/lib/auth/admin'
import { runDeepHealthChecks } from '@/lib/health/checks'
import { logger } from '@/lib/logger'

/** Deep health for logged-in admins (no HEALTH_CHECK_SECRET required). */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const report = await runDeepHealthChecks()
    return NextResponse.json(report, {
      status: report.status === 'healthy' ? 200 : 503,
    })
  } catch (err) {
    logger.error('Admin health check failed', { err })
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
