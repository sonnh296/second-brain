import { logger } from '@/lib/logger'

export type ProviderCostStatus = 'ok' | 'missing_key' | 'error' | 'skipped'

export type ProviderCostResult = {
  provider: 'openai' | 'anthropic'
  status: ProviderCostStatus
  /** Month-to-date USD when status === 'ok' */
  mtd_usd: number | null
  error?: string
  fetched_at?: string
}

type CacheEntry = {
  expiresAt: number
  result: ProviderCostResult
}

const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, CacheEntry>()

function startOfMonthUnixSeconds(now = new Date()): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)
}

function startOfMonthIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function endExclusiveIso(now = new Date()): string {
  // Exclusive end: start of tomorrow UTC so today is included
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  ).toISOString()
}

function roundUsd(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Anthropic reports amount in lowest currency units (cents). "123.45" USD → $1.2345 */
export function anthropicAmountToUsd(amount: string | number | null | undefined): number {
  if (amount == null) return 0
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return 0
  return n / 100
}

function getCached(key: string): ProviderCostResult | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    cache.delete(key)
    return null
  }
  return hit.result
}

function setCache(key: string, result: ProviderCostResult): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result })
}

/** @internal */
export function clearProviderCostCacheForTests(): void {
  cache.clear()
}

type OpenAiCostBucket = {
  start_time?: number
  end_time?: number
  result?: Array<{
    amount?: { value?: number; currency?: string }
    line_item?: string | null
  }>
  results?: Array<{
    amount?: { value?: number; currency?: string }
    line_item?: string | null
  }>
}

/**
 * OpenAI Organization Costs API (Admin key required).
 * https://platform.openai.com/docs/api-reference/usage/costs
 */
export async function fetchOpenAiMonthCost(now = new Date()): Promise<ProviderCostResult> {
  const key = process.env.OPENAI_ADMIN_API_KEY?.trim()
  if (!key) {
    return { provider: 'openai', status: 'missing_key', mtd_usd: null }
  }

  const cacheKey = `openai:${now.getUTCFullYear()}-${now.getUTCMonth()}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const startTime = startOfMonthUnixSeconds(now)
  const dayOfMonth = now.getUTCDate()
  const url = new URL('https://api.openai.com/v1/organization/costs')
  url.searchParams.set('start_time', String(startTime))
  url.searchParams.set('bucket_width', '1d')
  url.searchParams.set('limit', String(Math.min(Math.max(dayOfMonth, 1), 31)))

  try {
    let total = 0
    let page: string | null = null
    let pages = 0

    do {
      if (page) url.searchParams.set('page', page)
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`OpenAI costs HTTP ${res.status}: ${body.slice(0, 200)}`)
      }

      const json = (await res.json()) as {
        data?: OpenAiCostBucket[]
        has_more?: boolean
        next_page?: string | null
      }

      for (const bucket of json.data ?? []) {
        const rows = bucket.result ?? bucket.results ?? []
        for (const row of rows) {
          const value = row.amount?.value
          if (typeof value === 'number' && Number.isFinite(value)) {
            total += value
          }
        }
      }

      page = json.has_more && json.next_page ? json.next_page : null
      pages += 1
    } while (page && pages < 8)

    const result: ProviderCostResult = {
      provider: 'openai',
      status: 'ok',
      mtd_usd: roundUsd(total),
      fetched_at: new Date().toISOString(),
    }
    setCache(cacheKey, result)
    return result
  } catch (err) {
    logger.warn('Failed to fetch OpenAI organization costs', { err })
    return {
      provider: 'openai',
      status: 'error',
      mtd_usd: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

type AnthropicCostBucket = {
  starting_at?: string
  ending_at?: string
  results?: Array<{
    amount?: string
    currency?: string
  }>
}

/**
 * Anthropic Cost Report Admin API (Admin key required).
 * Amount is in cents as a decimal string.
 */
export async function fetchAnthropicMonthCost(now = new Date()): Promise<ProviderCostResult> {
  const key = process.env.ANTHROPIC_ADMIN_API_KEY?.trim()
  if (!key) {
    return { provider: 'anthropic', status: 'missing_key', mtd_usd: null }
  }

  const cacheKey = `anthropic:${now.getUTCFullYear()}-${now.getUTCMonth()}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const startingAt = startOfMonthIso(now)
  const endingAt = endExclusiveIso(now)
  const dayOfMonth = now.getUTCDate()

  try {
    let totalCents = 0
    let page: string | null = null
    let pages = 0

    do {
      const url = new URL('https://api.anthropic.com/v1/organizations/cost_report')
      url.searchParams.set('starting_at', startingAt)
      url.searchParams.set('ending_at', endingAt)
      url.searchParams.set('bucket_width', '1d')
      url.searchParams.set('limit', String(Math.min(Math.max(dayOfMonth, 1), 31)))
      if (page) url.searchParams.set('page', page)

      const res = await fetch(url.toString(), {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Anthropic cost_report HTTP ${res.status}: ${body.slice(0, 200)}`)
      }

      const json = (await res.json()) as {
        data?: AnthropicCostBucket[]
        has_more?: boolean
        next_page?: string | null
      }

      for (const bucket of json.data ?? []) {
        for (const row of bucket.results ?? []) {
          totalCents += Number(row.amount) || 0
        }
      }

      page = json.has_more && json.next_page ? json.next_page : null
      pages += 1
    } while (page && pages < 8)

    const result: ProviderCostResult = {
      provider: 'anthropic',
      status: 'ok',
      mtd_usd: roundUsd(anthropicAmountToUsd(totalCents)),
      fetched_at: new Date().toISOString(),
    }
    setCache(cacheKey, result)
    return result
  } catch (err) {
    logger.warn('Failed to fetch Anthropic organization costs', { err })
    return {
      provider: 'anthropic',
      status: 'error',
      mtd_usd: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function fetchProviderMonthCosts(now = new Date()): Promise<{
  openai: ProviderCostResult
  anthropic: ProviderCostResult
}> {
  const [openai, anthropic] = await Promise.all([
    fetchOpenAiMonthCost(now),
    fetchAnthropicMonthCost(now),
  ])
  return { openai, anthropic }
}

/**
 * Hybrid MTD: use provider billed USD when available; fill gaps from usage_logs estimates.
 */
export function mergeHybridCostUsd(opts: {
  estimatedOpenaiUsd: number
  estimatedAnthropicUsd: number
  openai: ProviderCostResult
  anthropic: ProviderCostResult
}): {
  mtd_usd: number
  openai_usd: number
  anthropic_usd: number
  sources: Array<'openai_api' | 'anthropic_api' | 'usage_estimate'>
} {
  const sources: Array<'openai_api' | 'anthropic_api' | 'usage_estimate'> = []

  let openaiUsd: number
  if (opts.openai.status === 'ok' && opts.openai.mtd_usd != null) {
    openaiUsd = opts.openai.mtd_usd
    sources.push('openai_api')
  } else {
    openaiUsd = opts.estimatedOpenaiUsd
    sources.push('usage_estimate')
  }

  let anthropicUsd: number
  if (opts.anthropic.status === 'ok' && opts.anthropic.mtd_usd != null) {
    anthropicUsd = opts.anthropic.mtd_usd
    sources.push('anthropic_api')
  } else {
    anthropicUsd = opts.estimatedAnthropicUsd
    if (!sources.includes('usage_estimate')) sources.push('usage_estimate')
  }

  return {
    mtd_usd: roundUsd(openaiUsd + anthropicUsd),
    openai_usd: roundUsd(openaiUsd),
    anthropic_usd: roundUsd(anthropicUsd),
    sources,
  }
}
