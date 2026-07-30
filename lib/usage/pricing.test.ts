import { describe, expect, it } from 'vitest'
import {
  estimateTokenCostUsd,
  forecastMonthEndUsd,
  resolveModelRates,
} from '@/lib/usage/pricing'

describe('pricing', () => {
  it('resolves known Claude models', () => {
    expect(resolveModelRates('claude-haiku-4-5').inputPer1M).toBe(1)
    expect(resolveModelRates('claude-sonnet-4-5').inputPer1M).toBe(3)
  })

  it('estimates token cost', () => {
    const cost = estimateTokenCostUsd(1_000_000, 1_000_000, 'claude-haiku-4-5')
    expect(cost).toBe(6) // 1 + 5
  })

  it('forecasts month-end from MTD', () => {
    // day 10 of a 30-day month → 2x
    const now = new Date(Date.UTC(2026, 0, 10))
    expect(forecastMonthEndUsd(10, now)).toBe(31) // 10/10 * 31 (Jan has 31)
  })
})
