import { z } from 'zod'

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  QDRANT_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
})

let validated = false

function parseBoundedInt(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(raw ?? fallback)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`[env] ${name} must be an integer between ${min} and ${max}`)
  }
  return value
}

function parseBoundedFloat(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(raw ?? fallback)
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`[env] ${name} must be a number between ${min} and ${max}`)
  }
  return value
}

function validateOptionalConfig(): void {
  if (!process.env.QDRANT_API_KEY?.trim()) {
    console.warn('[env] QDRANT_API_KEY is not set — only safe if your Qdrant endpoint has no API key auth')
  }

  if (process.env.OCR_ENABLED === 'true') {
    const hasCreds =
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
    if (!hasCreds) {
      console.warn(
        '[env] OCR_ENABLED=true but neither GOOGLE_APPLICATION_CREDENTIALS nor GOOGLE_SERVICE_ACCOUNT_JSON is set'
      )
    }
  }

  if (process.env.RERANK_ENABLED === 'true' && !process.env.COHERE_API_KEY?.trim()) {
    console.warn('[env] RERANK_ENABLED=true but COHERE_API_KEY is missing — reranking will be skipped at runtime')
  }

  if (!process.env.HEALTH_CHECK_SECRET?.trim()) {
    console.warn('[env] HEALTH_CHECK_SECRET is not set — /api/health/deep will return 503')
  }

  if (!process.env.OPENAI_ADMIN_API_KEY?.trim()) {
    console.warn(
      '[env] OPENAI_ADMIN_API_KEY is not set — admin cost will estimate OpenAI spend from usage_logs'
    )
  }
  if (!process.env.ANTHROPIC_ADMIN_API_KEY?.trim()) {
    console.warn(
      '[env] ANTHROPIC_ADMIN_API_KEY is not set — admin cost will estimate Anthropic spend from usage_logs'
    )
  }

  parseBoundedInt('WORKER_CONCURRENCY', process.env.WORKER_CONCURRENCY, 1, 1, 16)
  parseBoundedFloat('RAG_MIN_SCORE', process.env.RAG_MIN_SCORE, 0.12, 0, 1)
  parseBoundedInt('RAG_FALLBACK_TOP_N', process.env.RAG_FALLBACK_TOP_N, 3, 1, 20)
  parseBoundedInt('CHAT_HISTORY_LIMIT', process.env.CHAT_HISTORY_LIMIT, 10, 1, 50)
  parseBoundedInt('RERANK_TOP_N', process.env.RERANK_TOP_N, 5, 1, 20)
  parseBoundedInt('RERANK_CANDIDATES', process.env.RERANK_CANDIDATES, 20, 5, 100)
  parseBoundedInt('RAG_MIN_CHUNKS', process.env.RAG_MIN_CHUNKS, 3, 1, 20)
  parseBoundedInt('RAG_MAX_CHUNKS', process.env.RAG_MAX_CHUNKS, 8, 1, 20)
  parseBoundedInt('RAG_CONTEXT_TOKEN_BUDGET', process.env.RAG_CONTEXT_TOKEN_BUDGET, 8000, 1000, 32000)
  parseBoundedFloat('RAG_SCORE_KEEP_RATIO', process.env.RAG_SCORE_KEEP_RATIO, 0.8, 0.1, 1)
}

/** Fail fast on missing required server env (Next.js + worker). */
export function validateServerEnv(): void {
  if (validated) return

  const result = serverEnvSchema.safeParse(process.env)
  if (!result.success) {
    const fields = Object.keys(result.error.flatten().fieldErrors)
    throw new Error(
      `[env] Missing or invalid environment: ${fields.join(', ')}. Check .env.local`
    )
  }

  validateOptionalConfig()
  validated = true
}

export type ServerEnv = z.infer<typeof serverEnvSchema>

/** Typed access after validateServerEnv() — optional keys use process.env directly. */
export function getServerEnv(): ServerEnv {
  validateServerEnv()
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME!,
    QDRANT_URL: process.env.QDRANT_URL!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    REDIS_URL: process.env.REDIS_URL!,
  }
}

/** @internal Reset cached validation — for tests only. */
export function resetEnvValidationForTests(): void {
  validated = false
}
