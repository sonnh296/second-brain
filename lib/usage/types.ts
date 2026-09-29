export type StorageStats = {
  documents_bytes: number
  trash_bytes: number
  attachments_bytes: number
  total_bytes: number
  limit_bytes: number
  documents_count: number
  documents_limit: number
  trash_count: number
}

export type TokenTotals = {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export type TokenByPurpose = TokenTotals & {
  purpose: string
  requests: number
}

export type TokenByDay = TokenTotals & {
  date: string
}

export type ProfileStats = {
  username: string
  /** Shown in UI; falls back to username when empty */
  display_name: string | null
  role: string
  /** Authenticated avatar stream URL, or null if none */
  avatar_url: string | null
  personalization_enabled: boolean
  personalization_consent_at: string | null
  storage: StorageStats
  /** False when usage_logs table is missing or unreadable */
  usage_tracking_available: boolean
  tokens: {
    all_time: TokenTotals
    last_30_days: TokenTotals
    by_purpose: TokenByPurpose[]
    by_day: TokenByDay[]
  }
}
