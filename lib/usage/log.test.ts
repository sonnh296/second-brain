import { describe, it, expect } from 'vitest'
import { fromAiSdkUsage, fromAiSdkSteps } from './log'

describe('fromAiSdkUsage', () => {
  it('reads AI SDK v4 prompt/completion token fields', () => {
    expect(
      fromAiSdkUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    ).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 })
  })

  it('reads snake_case provider fields', () => {
    expect(
      fromAiSdkUsage({ input_tokens: 10, output_tokens: 5, total_tokens: 15 })
    ).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 })
  })

  it('returns zeros for missing usage', () => {
    expect(fromAiSdkUsage(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    })
  })
})

describe('fromAiSdkSteps', () => {
  it('sums usage across tool steps', () => {
    expect(
      fromAiSdkSteps(
        [
          { usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
          { usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 } },
        ],
        undefined
      )
    ).toEqual({ inputTokens: 30, outputTokens: 13, totalTokens: 43 })
  })

  it('falls back to top-level usage when steps empty', () => {
    expect(
      fromAiSdkSteps([], { promptTokens: 7, completionTokens: 3, totalTokens: 10 })
    ).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 })
  })
})
