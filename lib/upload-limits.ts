import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_FILE_SIZE_BYTES =
  Number(process.env.MAX_FILE_SIZE_MB ?? 1024) * 1024 * 1024

export const MAX_STORAGE_BYTES_PER_USER =
  Number(process.env.MAX_STORAGE_MB_PER_USER ?? 10240) * 1024 * 1024

export const MAX_DOCS_PER_USER = Number(process.env.MAX_DOCUMENTS_PER_USER ?? 1000)

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? 'unknown'
  const cleaned = base.replace(/[\x00-\x1f]/g, '').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 200) : 'unknown'
}

export type QuotaError =
  | { code: 'doc_limit'; message: string }
  | { code: 'file_size'; message: string }
  | { code: 'storage'; message: string }

export async function checkDocumentQuota(
  supabase: SupabaseClient,
  userId: string,
  additionalBytes: number
): Promise<{ ok: true } | { ok: false; error: QuotaError }> {
  const { count: docCount, error: countErr } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countErr) {
    throw new Error('Database error')
  }

  if ((docCount ?? 0) >= MAX_DOCS_PER_USER) {
    return {
      ok: false,
      error: {
        code: 'doc_limit',
        message: `Document limit reached (max ${MAX_DOCS_PER_USER} documents per user)`,
      },
    }
  }

  if (additionalBytes > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: {
        code: 'file_size',
        message: `File too large (max ${process.env.MAX_FILE_SIZE_MB ?? 1024} MB)`,
      },
    }
  }

  const { data: storageRows, error: storageErr } = await supabase
    .from('documents')
    .select('file_size_bytes')
    .eq('user_id', userId)

  if (storageErr) {
    throw new Error('Database error')
  }

  const usedBytes = (storageRows ?? []).reduce(
    (sum, row) => sum + (row.file_size_bytes ?? 0),
    0
  )

  if (usedBytes + additionalBytes > MAX_STORAGE_BYTES_PER_USER) {
    const maxMb = process.env.MAX_STORAGE_MB_PER_USER ?? 10240
    return {
      ok: false,
      error: {
        code: 'storage',
        message: `Storage limit reached (max ${maxMb} MB per user)`,
      },
    }
  }

  return { ok: true }
}

export function quotaStatusCode(error: QuotaError): number {
  switch (error.code) {
    case 'file_size':
      return 413
    case 'doc_limit':
    case 'storage':
      return 403
  }
}
