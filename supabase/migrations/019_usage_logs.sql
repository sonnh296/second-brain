-- =============================================================
-- 019: AI / embedding usage logs for profile stats
-- =============================================================

CREATE TABLE IF NOT EXISTS usage_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose        TEXT NOT NULL CHECK (purpose IN (
    'chat',
    'title',
    'embedding_query',
    'embedding_ingest'
  )),
  model          TEXT,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER NOT NULL DEFAULT 0,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created
  ON usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_purpose
  ON usage_logs(user_id, purpose);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_selects_own_usage_logs" ON usage_logs;
CREATE POLICY "user_selects_own_usage_logs" ON usage_logs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_inserts_own_usage_logs" ON usage_logs;
CREATE POLICY "user_inserts_own_usage_logs" ON usage_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());
