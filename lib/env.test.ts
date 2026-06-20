import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateServerEnv, resetEnvValidationForTests } from './env'

const BASE_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'access',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'bucket',
  QDRANT_URL: 'http://localhost:6333',
  OPENAI_API_KEY: 'sk-test',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  REDIS_URL: 'redis://localhost:6379',
}

describe('validateServerEnv', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    resetEnvValidationForTests()
    process.env = { ...originalEnv, ...BASE_ENV }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
    resetEnvValidationForTests()
  })

  it('passes with required vars', () => {
    expect(() => validateServerEnv()).not.toThrow()
  })

  it('throws when required var is missing', () => {
    delete process.env.OPENAI_API_KEY
    expect(() => validateServerEnv()).toThrow(/OPENAI_API_KEY/)
  })

  it('throws when WORKER_CONCURRENCY is out of range', () => {
    process.env.WORKER_CONCURRENCY = '99'
    expect(() => validateServerEnv()).toThrow(/WORKER_CONCURRENCY/)
  })

  it('throws when RAG_MIN_SCORE is out of range', () => {
    process.env.RAG_MIN_SCORE = '2'
    expect(() => validateServerEnv()).toThrow(/RAG_MIN_SCORE/)
  })

  it('warns when RERANK_ENABLED without COHERE_API_KEY', () => {
    process.env.RERANK_ENABLED = 'true'
    delete process.env.COHERE_API_KEY
    validateServerEnv()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('COHERE_API_KEY')
    )
  })
})
