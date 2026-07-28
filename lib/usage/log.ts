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

/** Persist token usage. Never throws — logging must not break chat/ingestion. */
export async function logUsage(
  entry: UsageLogInput,
  client?: SupabaseClient
): Promise<void> {
  const inputTokens = normalizeTokens(entry.inputTokens)
  const outputTokens = normalizeTokens(entry.outputTokens)
  const totalTokens =
    normalizeTokens(entry.totalTokens) || inputTokens + outputTokens

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) return

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
      logger.error('Failed to log usage', { err: error, userId: entry.userId, purpose: entry.purpose })
    }
  } catch (err) {
    logger.error('Failed to log usage', { err, userId: entry.userId, purpose: entry.purpose })
  }
}

export type AiSdkUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
} | null | undefined

export function fromAiSdkUsage(usage: AiSdkUsage): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
} {
  return {
    inputTokens: normalizeTokens(usage?.promptTokens),
    outputTokens: normalizeTokens(usage?.completionTokens),
    totalTokens: normalizeTokens(usage?.totalTokens),
  }
}
