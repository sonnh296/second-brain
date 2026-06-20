import { NextRequest, NextResponse } from 'next/server'
import { runDeepHealthChecks } from '@/lib/health/checks'
import { isDeepHealthConfigured, verifyHealthCheckSecret } from '@/lib/health/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isDeepHealthConfigured()) {
    return NextResponse.json(
      { error: 'Deep health check is not configured. Set HEALTH_CHECK_SECRET.' },
      { status: 503 }
    )
  }

  if (!verifyHealthCheckSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report = await runDeepHealthChecks()

  return NextResponse.json(report, {
    status: report.status === 'healthy' ? 200 : 503,
  })
}
