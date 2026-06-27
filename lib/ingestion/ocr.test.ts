import { describe, it, expect } from 'vitest'
import { estimateOcrCostUsd, isOcrEligibleType, isLowQualityOcrText } from './ocr'

describe('isOcrEligibleType', () => {
  it('accepts raster images', () => {
    expect(isOcrEligibleType('png')).toBe(true)
    expect(isOcrEligibleType('jpg')).toBe(true)
  })

  it('skips svg', () => {
    expect(isOcrEligibleType('svg')).toBe(false)
  })

  it('skips non-images', () => {
    expect(isOcrEligibleType('pdf')).toBe(false)
  })
})

describe('isLowQualityOcrText', () => {
  it('flags garbled vi-hint output', () => {
    expect(isLowQualityOcrText('*****. 1.\nA&#*****\n*tak.')).toBe(true)
  })

  it('accepts Chinese OCR output', () => {
    expect(isLowQualityOcrText('书籍四型\n社会在发展,生活越来越好')).toBe(false)
  })
})

describe('estimateOcrCostUsd', () => {
  it('estimates 100k images', () => {
    const est = estimateOcrCostUsd(100_000)
    expect(est.billableUnits).toBe(99_000)
    expect(est.estimatedUsd).toBe(148.5)
  })

  it('first 1000 free', () => {
    const est = estimateOcrCostUsd(500)
    expect(est.estimatedUsd).toBe(0)
  })
})
