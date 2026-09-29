import { z } from 'zod'

export const PlanFeatureSchema = z.array(z.string().trim().min(1).max(200)).max(30)

export const PlanUpsertSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, 'slug must be lowercase letters, numbers, _ or -'),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  price_display: z.string().trim().min(1).max(80),
  price_monthly_vnd: z.number().int().min(0).max(100_000_000_000).optional(),
  storage_limit_bytes: z.number().int().min(0).nullable().optional(),
  documents_limit: z.number().int().min(0).nullable().optional(),
  features: PlanFeatureSchema.optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  is_active: z.boolean().optional(),
})

export type PlanUpsertInput = z.infer<typeof PlanUpsertSchema>

export type SubscriptionPlan = {
  id: string
  slug: string
  name: string
  description: string | null
  price_display: string
  price_monthly_vnd: number
  storage_limit_bytes: number | null
  documents_limit: number | null
  features: string[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export function normalizePlanRow(row: Record<string, unknown>): SubscriptionPlan {
  const featuresRaw = row.features
  const features = Array.isArray(featuresRaw)
    ? featuresRaw.filter((f): f is string => typeof f === 'string')
    : []

  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    price_display: String(row.price_display ?? ''),
    price_monthly_vnd: Number(row.price_monthly_vnd ?? 0),
    storage_limit_bytes:
      row.storage_limit_bytes == null ? null : Number(row.storage_limit_bytes),
    documents_limit: row.documents_limit == null ? null : Number(row.documents_limit),
    features,
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}
