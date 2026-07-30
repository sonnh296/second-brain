/**
 * Approximate published API pricing (USD per 1M tokens).
 * Used for admin cost estimates — not billing invoices.
 */
export type ModelRates = {
  inputPer1M: number
  outputPer1M: number
}

/** Per-1M-token rates keyed by model id substrings (longest match wins). */
const MODEL_RATES: { match: string; rates: ModelRates }[] = [
  { match: 'claude-opus-4', rates: { inputPer1M: 15, outputPer1M: 75 } },
  { match: 'claude-sonnet-4', rates: { inputPer1M: 3, outputPer1M: 15 } },
  { match: 'claude-haiku-4', rates: { inputPer1M: 1, outputPer1M: 5 } },
  { match: 'claude-3-5-sonnet', rates: { inputPer1M: 3, outputPer1M: 15 } },
  { match: 'claude-3-5-haiku', rates: { inputPer1M: 0.8, outputPer1M: 4 } },
  { match: 'claude-3-opus', rates: { inputPer1M: 15, outputPer1M: 75 } },
  { match: 'claude-3-haiku', rates: { inputPer1M: 0.25, outputPer1M: 1.25 } },
  { match: 'text-embedding-3-small', rates: { inputPer1M: 0.02, outputPer1M: 0 } },
  { match: 'text-embedding-3-large', rates: { inputPer1M: 0.13, outputPer1M: 0 } },
  { match: 'text-embedding-ada-002', rates: { inputPer1M: 0.1, outputPer1M: 0 } },
]

const DEFAULT_CHAT_RATES: ModelRates = { inputPer1M: 1, outputPer1M: 5 }
const DEFAULT_EMBED_RATES: ModelRates = { inputPer1M: 0.02, outputPer1M: 0 }

export function resolveModelRates(
  model: string | null | undefined,
  purpose?: string | null
): ModelRates {
  const m = (model ?? '').toLowerCase()
  if (m) {
    const hit = MODEL_RATES.find((r) => m.includes(r.match))
    if (hit) return hit.rates
  }
  if (purpose?.startsWith('embedding')) return DEFAULT_EMBED_RATES
  return DEFAULT_CHAT_RATES
}

export function estimateTokenCostUsd(
  inputTokens: number,
  outputTokens: number,
  model?: string | null,
  purpose?: string | null
): number {
  const rates = resolveModelRates(model, purpose)
  const cost =
    (inputTokens / 1_000_000) * rates.inputPer1M +
    (outputTokens / 1_000_000) * rates.outputPer1M
  return cost
}

export function forecastMonthEndUsd(costMtd: number, now = new Date()): number {
  const day = now.getUTCDate()
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  if (day <= 0) return costMtd
  return (costMtd / day) * daysInMonth
}

export function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}
