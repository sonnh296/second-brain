-- =============================================================
-- Note Everything 2.1 — soft-disable users via profiles.disabled_at
-- =============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_disabled_at
  ON profiles(disabled_at)
  WHERE disabled_at IS NOT NULL;
