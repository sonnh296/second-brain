import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceSupabaseClient } from '@/lib/db/server'
import { logger } from '@/lib/logger'

export type UsagePurpose =
  | 'chat'
  | 'title'
  | 'embedding_query'
  | 'embedding_ingest'

export type UsageLogInput = {
  userId: string
  purpose: UsagePurpose
  model?: string | null
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  metadata?: Record<string, unknown>
}

function normalizeTokens(n: number | undefined | null): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

function readTokenField(
  usage: Record<string, unknown> | null | undefined,
  keys: string[]
): number {
  if (!usage) return 0
  for (const key of keys) {
    const v = usage[key]
    if (typeof v === 'number') return normalizeTokens(v)
  }
  return 0
}

/** Persist token usage. Never throws — logging must not break chat/ingestion. */
export async function logUsage(
  entry: UsageLogInput,
  client?: SupabaseClient
): Promise<void> {
  const inputTokens = normalizeTokens(entry.inputTokens)
  const outputTokens = normalizeTokens(entry.outputTokens)
  const totalTokens =
    normalizeTokens(entry.totalTokens) || inputTokens + outputTokens

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    logger.warn('Skipped usage log — all token counts are 0', {
      userId: entry.userId,
      purpose: entry.purpose,
      model: entry.model,
    })
    return
  }

  try {
    const supabase = client ?? createServiceSupabaseClient()
    const { error } = await supabase.from('usage_logs').insert({
      user_id: entry.userId,
      purpose: entry.purpose,
      model: entry.model ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      metadata: entry.metadata ?? {},
    })
    if (error) {
      logger.error('Failed to log usage', {
        err: error,
        code: error.code,
        message: error.message,
        userId: entry.userId,
        purpose: entry.purpose,
        hint:
          error.code === 'PGRST205' || error.message?.includes('usage_logs')
            ? 'Apply 001_schema_v2.sql (usage_logs table missing)'
            : undefined,
      })
    }
  } catch (err) {
    logger.error('Failed to log usage', { err, userId: entry.userId, purpose: entry.purpose })
  }
}

/** AI SDK v4 uses promptTokens; some providers/adapters use inputTokens / snake_case. */
export type AiSdkUsage = Record<string, unknown> | null | undefined

export function fromAiSdkUsage(usage: AiSdkUsage): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
} {
  const inputTokens = readTokenField(usage ?? undefined, [
    'promptTokens',
    'inputTokens',
    'prompt_tokens',
    'input_tokens',
  ])
  const outputTokens = readTokenField(usage ?? undefined, [
    'completionTokens',
    'outputTokens',
    'completion_tokens',
    'output_tokens',
  ])
  const totalTokens =
    readTokenField(usage ?? undefined, ['totalTokens', 'total_tokens']) ||
    inputTokens + outputTokens

  return { inputTokens, outputTokens, totalTokens }
}

/** Sum usage across multi-step tool calls when present. */
export function fromAiSdkSteps(
  steps:
    | Array<{ usage?: AiSdkUsage }>
    | null
    | undefined,
  fallback?: AiSdkUsage
): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
} {
  if (steps && steps.length > 0) {
    let inputTokens = 0
    let outputTokens = 0
    let totalTokens = 0
    for (const step of steps) {
      const u = fromAiSdkUsage(step.usage)
      inputTokens += u.inputTokens
      outputTokens += u.outputTokens
      totalTokens += u.totalTokens
    }
    if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
      return {
        inputTokens,
        outputTokens,
        totalTokens: totalTokens || inputTokens + outputTokens,
      }
    }
  }
  return fromAiSdkUsage(fallback)
}
