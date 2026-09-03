/** Remember session for 30 days in browser cookies */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30

export function withSessionMaxAge(
  options: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...options,
    maxAge: SESSION_MAX_AGE_SEC,
  }
}

/** Transient network failures talking to Supabase Auth (common locally / flaky WAN). */
export function isTransientAuthError(err: unknown): boolean {
  if (!err) return false
  const parts: string[] = []
  if (err instanceof Error) {
    parts.push(err.message)
    if (err.cause instanceof Error) parts.push(err.cause.message)
    const causeCode = (err.cause as { code?: string } | undefined)?.code
    if (causeCode) parts.push(causeCode)
  } else if (typeof err === 'object') {
    const o = err as { message?: string; code?: string; status?: number; name?: string }
    if (o.message) parts.push(o.message)
    if (o.code) parts.push(o.code)
    if (o.name) parts.push(o.name)
  } else {
    parts.push(String(err))
  }
  const text = parts.join(' ')
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|network|timeout|AuthRetryableFetchError/i.test(
    text
  )
}

