import type { SupabaseClient } from '@supabase/supabase-js'
import {
  estimateTokenCostUsd,
  forecastMonthEndUsd,
} from '@/lib/usage/pricing'
import {
  fetchProviderMonthCosts,
  mergeHybridCostUsd,
  type ProviderCostResult,
} from '@/lib/usage/provider-costs'
import type { TokenByPurpose, TokenTotals } from '@/lib/usage/types'

export type AdminSystemStats = {
  users: {
    total: number
    active: number
    disabled: number
    admins: number
  }
  storage: {
    documents_bytes: number
    trash_bytes: number
    attachments_bytes: number
    total_bytes: number
    documents_count: number
    trash_count: number
  }
  tokens: {
    mtd: TokenTotals
    all_time: TokenTotals
    by_purpose: TokenByPurpose[]
  }
  cost: {
    /** Hybrid MTD: provider billed when available, else usage estimate. */
    mtd_usd: number
    forecast_eom_usd: number
    /** Always from internal usage_logs × published rates. */
    estimated_usd: number
    estimated_openai_usd: number
    estimated_anthropic_usd: number
    openai_usd: number
    anthropic_usd: number
    providers: {
      openai: ProviderCostResult
      anthropic: ProviderCostResult
    }
    sources: Array<'openai_api' | 'anthropic_api' | 'usage_estimate'>
    note: string
  }
}

function emptyTotals(): TokenTotals {
  return { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
}

function startOfMonthUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function isOpenaiPurpose(purpose: string, model: string | null | undefined): boolean {
  if (purpose.startsWith('embedding')) return true
  const m = (model ?? '').toLowerCase()
  return m.includes('text-embedding') || m.includes('whisper') || m.includes('gpt-')
}

function isAnthropicPurpose(purpose: string, model: string | null | undefined): boolean {
  if (purpose === 'chat' || purpose === 'title') return true
  const m = (model ?? '').toLowerCase()
  return m.includes('claude')
}

function buildCostNote(
  openai: ProviderCostResult,
  anthropic: ProviderCostResult,
  sources: Array<'openai_api' | 'anthropic_api' | 'usage_estimate'>
): string {
  const parts: string[] = []
  if (sources.includes('openai_api')) parts.push('OpenAI: API billing')
  else if (openai.status === 'missing_key') parts.push('OpenAI: ước tính (thiếu OPENAI_ADMIN_API_KEY)')
  else if (openai.status === 'error') parts.push('OpenAI: ước tính (API lỗi)')
  else parts.push('OpenAI: ước tính')

  if (sources.includes('anthropic_api')) parts.push('Anthropic: API billing')
  else if (anthropic.status === 'missing_key')
    parts.push('Anthropic: ước tính (thiếu ANTHROPIC_ADMIN_API_KEY)')
  else if (anthropic.status === 'error') parts.push('Anthropic: ước tính (API lỗi)')
  else parts.push('Anthropic: ước tính')

  return parts.join(' · ')
}

export async function getAdminSystemStats(
  service: SupabaseClient
): Promise<AdminSystemStats> {
  const now = new Date()
  const monthStart = startOfMonthUtc(now).toISOString()

  const [
    { data: profiles },
    { data: docs },
    { data: attachments },
    { data: usageRows, error: usageError },
    providerCosts,
  ] = await Promise.all([
    service.from('profiles').select('id, role, disabled_at'),
    service.from('documents').select('file_size_bytes, deleted_at'),
    service.from('message_attachments').select('byte_size'),
    service
      .from('usage_logs')
      .select('purpose, model, input_tokens, output_tokens, total_tokens, created_at')
      .order('created_at', { ascending: false })
      .limit(50000),
    fetchProviderMonthCosts(now),
  ])

  if (usageError) {
    console.error('[admin/stats] usage_logs query failed', usageError)
  }

  let active = 0
  let disabled = 0
  let admins = 0
  for (const p of profiles ?? []) {
    if (p.disabled_at) disabled += 1
    else active += 1
    if (p.role === 'admin') admins += 1
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

  const allTime = emptyTotals()
  const mtd = emptyTotals()
  const byPurposeMap = new Map<string, TokenByPurpose>()
  let estimatedOpenai = 0
  let estimatedAnthropic = 0
  let estimatedOther = 0

  for (const row of usageRows ?? []) {
    const input = row.input_tokens ?? 0
    const output = row.output_tokens ?? 0
    const total = row.total_tokens ?? input + output
    const created = row.created_at as string
    const model = row.model as string | null | undefined

    allTime.input_tokens += input
    allTime.output_tokens += output
    allTime.total_tokens += total

    const purpose = (row.purpose as string) ?? 'unknown'
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

    if (created >= monthStart) {
      mtd.input_tokens += input
      mtd.output_tokens += output
      mtd.total_tokens += total
      const rowCost = estimateTokenCostUsd(input, output, model, purpose)
      if (isOpenaiPurpose(purpose, model)) estimatedOpenai += rowCost
      else if (isAnthropicPurpose(purpose, model)) estimatedAnthropic += rowCost
      else estimatedOther += rowCost
    }
  }

  // Unclassified rows still count toward total estimate (usually none).
  estimatedAnthropic += estimatedOther

  const estimatedUsd = estimatedOpenai + estimatedAnthropic
  const hybrid = mergeHybridCostUsd({
    estimatedOpenaiUsd: estimatedOpenai,
    estimatedAnthropicUsd: estimatedAnthropic,
    openai: providerCosts.openai,
    anthropic: providerCosts.anthropic,
  })
  const forecast = forecastMonthEndUsd(hybrid.mtd_usd, now)

  return {
    users: {
      total: (profiles ?? []).length,
      active,
      disabled,
      admins,
    },
    storage: {
      documents_bytes: documentsBytes,
      trash_bytes: trashBytes,
      attachments_bytes: attachmentsBytes,
      total_bytes: documentsBytes + trashBytes + attachmentsBytes,
      documents_count: documentsCount,
      trash_count: trashCount,
    },
    tokens: {
      mtd,
      all_time: allTime,
      by_purpose: [...byPurposeMap.values()].sort(
        (a, b) => b.total_tokens - a.total_tokens
      ),
    },
    cost: {
      mtd_usd: hybrid.mtd_usd,
      forecast_eom_usd: Math.round(forecast * 10000) / 10000,
      estimated_usd: Math.round(estimatedUsd * 10000) / 10000,
      estimated_openai_usd: Math.round(estimatedOpenai * 10000) / 10000,
      estimated_anthropic_usd: Math.round(estimatedAnthropic * 10000) / 10000,
      openai_usd: hybrid.openai_usd,
      anthropic_usd: hybrid.anthropic_usd,
      providers: {
        openai: providerCosts.openai,
        anthropic: providerCosts.anthropic,
      },
      sources: hybrid.sources,
      note: buildCostNote(providerCosts.openai, providerCosts.anthropic, hybrid.sources),
    },
  }
}
