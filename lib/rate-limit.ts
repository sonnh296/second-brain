import { getRedis } from './queue'
import { logger } from './logger'

export interface RateLimitOptions {
  /** When true, deny requests if Redis is unreachable (use for uploads). */
  failClosed?: boolean
}

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Fail-open by default; set failClosed for upload endpoints.
 */
export async function checkRateLimit(
  identifier: string,
  action: string,
  limit: number,
  windowSec: number,
  options: RateLimitOptions = {}
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedis()
  const key = `rl:${action}:${identifier}`
  const now = Date.now()
  const windowMs = windowSec * 1000

  try {
    const pipeline = redis.pipeline()
    pipeline.zremrangebyscore(key, '-inf', now - windowMs)
    pipeline.zcard(key)

    const results = await pipeline.exec()
    const count = (results?.[1]?.[1] as number) ?? 0

    if (count >= limit) {
      return { allowed: false, remaining: 0 }
    }

    await redis
      .multi()
      .zadd(key, now, `${now}-${Math.random()}`)
      .expire(key, windowSec + 1)
      .exec()

    return { allowed: true, remaining: limit - count - 1 }
  } catch (err) {
    if (options.failClosed) {
      logger.warn('Rate limit Redis unreachable, failing closed', { err })
      return { allowed: false, remaining: 0 }
    }
    logger.warn('Rate limit Redis unreachable, failing open', { err })
    return { allowed: true, remaining: limit }
  }
}

/** Client IP for unauthenticated endpoints (login). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  return req.headers.get('x-real-ip') ?? 'unknown'
}
