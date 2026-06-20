import * as Sentry from '@sentry/node'

let initialized = false

/** Optional — no-op when SENTRY_DSN is unset. */
export function initSentry(): void {
  if (initialized || !process.env.SENTRY_DSN) return

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  })

  initialized = true
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>
): void {
  if (!process.env.SENTRY_DSN) return

  if (!initialized) initSentry()

  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context)
    Sentry.captureException(err)
  })
}
