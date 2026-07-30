import { captureException } from './sentry'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
  requestId?: string
  userId?: string
  documentId?: string
  sessionId?: string
  err?: unknown
  [key: string]: unknown
}

function serializeError(err: unknown): Record<string, unknown> | undefined {
  if (err == null) return undefined
  if (err instanceof Error) {
    const extra: Record<string, unknown> = {}
    for (const key of ['type', 'statusCode', 'url', 'code', 'cause'] as const) {
      const value = (err as Error & Record<string, unknown>)[key]
      if (value !== undefined) extra[key] = value
    }
    if (typeof err.cause === 'object' && err.cause !== null) {
      extra.cause = serializeError(err.cause)
    }
    return { name: err.name, message: err.message, stack: err.stack, ...extra }
  }
  if (typeof err === 'object') {
    try {
      return JSON.parse(JSON.stringify(err)) as Record<string, unknown>
    } catch {
      return { message: String(err) }
    }
  }
  return { message: String(err) }
}

function log(level: LogLevel, message: string, context: LogContext = {}) {
  const { err, ...rest } = context
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...rest,
    ...(err !== undefined ? { error: serializeError(err) } : {}),
  }
  const line = JSON.stringify(entry)

  if (level === 'error') {
    console.error(line)
    if (err !== undefined) captureException(err, rest)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
  debug: (message: string, context?: LogContext) => log('debug', message, context),
}
