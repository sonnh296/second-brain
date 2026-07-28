import {
  MAX_DOCS_PER_USER,
  MAX_STORAGE_BYTES_PER_USER,
} from '@/lib/upload-limits'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProfileStats,
  TokenByDay,
  TokenByPurpose,
  TokenTotals,
} from '@/lib/usage/types'

export type {
  ProfileStats,
  StorageStats,
  TokenByDay,
  TokenByPurpose,
  TokenTotals,
} from '@/lib/usage/types'

export async function getProfileStats(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileStats> {
  const [
    { data: profile },
    { data: docs },
    { data: attachments },
    usageResult,
  ] = await Promise.all([
    supabase.from('profiles').select('username, role').eq('id', userId).maybeSingle(),
    supabase
      .from('documents')
      .select('file_size_bytes, deleted_at')
      .eq('user_id', userId),
    supabase.from('message_attachments').select('byte_size').eq('user_id', userId),
    supabase
      .from('usage_logs')
      .select('purpose, input_tokens, output_tokens, total_tokens, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5000),
  ])

  const usageRows = usageResult.data
  const usageTrackingAvailable = !usageResult.error
  if (usageResult.error) {
    console.error('[profile] usage_logs query failed', {
      code: usageResult.error.code,
      message: usageResult.error.message,
      userId,
    })
  }
  let documentsBytes = 0
  let trashBytes = 0
  let documentsCount = 0
  let trashCount = 0
  for (const doc of docs ?? []) {
    const size = doc.file_size_bytes ?? 0
    if (doc.deleted_at) {
      trashBytes += size
      trashCount += 1
    } else {
      documentsBytes += size
      documentsCount += 1
    }
  }

  const attachmentsBytes = (attachments ?? []).reduce(
    (sum, row) => sum + (row.byte_size ?? 0),
    0
  )

  const allTime: TokenTotals = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
  const last30: TokenTotals = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
  const byPurposeMap = new Map<string, TokenByPurpose>()
  const byDayMap = new Map<string, TokenByDay>()
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000

  for (const row of usageRows ?? []) {
    const input = row.input_tokens ?? 0
    const output = row.output_tokens ?? 0
    const total = row.total_tokens ?? input + output
    const created = new Date(row.created_at).getTime()

    allTime.input_tokens += input
    allTime.output_tokens += output
    allTime.total_tokens += total

    const purpose = row.purpose as string
    const purposeAgg = byPurposeMap.get(purpose) ?? {
      purpose,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    }
    purposeAgg.requests += 1
    purposeAgg.input_tokens += input
    purposeAgg.output_tokens += output
    purposeAgg.total_tokens += total
    byPurposeMap.set(purpose, purposeAgg)

    if (created >= cutoff) {
      last30.input_tokens += input
      last30.output_tokens += output
      last30.total_tokens += total

      const day = new Date(row.created_at).toISOString().slice(0, 10)
      const dayAgg = byDayMap.get(day) ?? {
        date: day,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      }
      dayAgg.input_tokens += input
      dayAgg.output_tokens += output
      dayAgg.total_tokens += total
      byDayMap.set(day, dayAgg)
    }
  }

  const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  return {
    username: profile?.username ?? 'user',
    role: profile?.role ?? 'user',
    usage_tracking_available: usageTrackingAvailable,
    storage: {
      documents_bytes: documentsBytes,
      trash_bytes: trashBytes,
      attachments_bytes: attachmentsBytes,
      total_bytes: documentsBytes + trashBytes + attachmentsBytes,
      limit_bytes: MAX_STORAGE_BYTES_PER_USER,
      documents_count: documentsCount,
      documents_limit: MAX_DOCS_PER_USER,
      trash_count: trashCount,
    },
    tokens: {
      all_time: allTime,
      last_30_days: last30,
      by_purpose: [...byPurposeMap.values()].sort(
        (a, b) => b.total_tokens - a.total_tokens
      ),
      by_day: byDay,
    },
  }
}
