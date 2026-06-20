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
    return { name: err.name, message: err.message, stack: err.stack }
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
