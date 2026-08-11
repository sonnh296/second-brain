import { describe, expect, it } from 'vitest'
import {
  anthropicAmountToUsd,
  mergeHybridCostUsd,
  type ProviderCostResult,
} from '@/lib/usage/provider-costs'

describe('anthropicAmountToUsd', () => {
  it('converts cents string to USD', () => {
    expect(anthropicAmountToUsd('123.45')).toBeCloseTo(1.2345, 4)
  })

  it('handles zero and invalid', () => {
    expect(anthropicAmountToUsd('0')).toBe(0)
    expect(anthropicAmountToUsd(null)).toBe(0)
    expect(anthropicAmountToUsd('abc')).toBe(0)
  })
})

describe('mergeHybridCostUsd', () => {
  const missing: ProviderCostResult = {
    provider: 'openai',
    status: 'missing_key',
    mtd_usd: null,
  }

  it('uses estimates when both providers missing', () => {
    const merged = mergeHybridCostUsd({
      estimatedOpenaiUsd: 1.5,
      estimatedAnthropicUsd: 2.5,
      openai: missing,
      anthropic: { ...missing, provider: 'anthropic' },
    })
    expect(merged.mtd_usd).toBe(4)
    expect(merged.sources).toEqual(['usage_estimate'])
  })

  it('prefers provider billed amounts when available', () => {
    const merged = mergeHybridCostUsd({
      estimatedOpenaiUsd: 1.5,
      estimatedAnthropicUsd: 2.5,
      openai: { provider: 'openai', status: 'ok', mtd_usd: 10 },
      anthropic: { provider: 'anthropic', status: 'ok', mtd_usd: 20 },
    })
    expect(merged.mtd_usd).toBe(30)
    expect(merged.sources).toEqual(['openai_api', 'anthropic_api'])
  })

  it('mixes provider + estimate', () => {
    const merged = mergeHybridCostUsd({
      estimatedOpenaiUsd: 1.5,
      estimatedAnthropicUsd: 2.5,
      openai: { provider: 'openai', status: 'ok', mtd_usd: 10 },
      anthropic: { provider: 'anthropic', status: 'error', mtd_usd: null, error: 'fail' },
    })
    expect(merged.openai_usd).toBe(10)
    expect(merged.anthropic_usd).toBe(2.5)
    expect(merged.mtd_usd).toBe(12.5)
    expect(merged.sources).toContain('openai_api')
    expect(merged.sources).toContain('usage_estimate')
  })
})
