import { createServerSupabaseClient } from '@/lib/db/server'
import { getRedis } from '@/lib/queue'
import { getQdrantClient } from '@/lib/vector'

export interface HealthCheckResult {
  ok: boolean
  latency_ms?: number
  error?: string
}

export interface DeepHealthReport {
  status: 'healthy' | 'degraded'
  checks: Record<string, HealthCheckResult>
}

export async function runDeepHealthChecks(): Promise<DeepHealthReport> {
  const checks: Record<string, HealthCheckResult> = {}

  const pgStart = Date.now()
  try {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.from('documents').select('id').limit(1)
    checks.postgres = error
      ? { ok: false, error: error.message }
      : { ok: true, latency_ms: Date.now() - pgStart }
  } catch (err) {
    checks.postgres = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const redisStart = Date.now()
  try {
    const redis = getRedis()
    await redis.ping()
    checks.redis = { ok: true, latency_ms: Date.now() - redisStart }
  } catch (err) {
    checks.redis = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const qdrantStart = Date.now()
  try {
    const client = getQdrantClient()
    await client.getCollections()
    checks.qdrant = { ok: true, latency_ms: Date.now() - qdrantStart }
  } catch (err) {
    checks.qdrant = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  return { status: allOk ? 'healthy' : 'degraded', checks }
}
