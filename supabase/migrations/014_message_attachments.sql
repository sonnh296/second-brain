-- =============================================================
-- Chat message attachments (images persisted to R2, not knowledge base)
-- =============================================================

CREATE TABLE IF NOT EXISTS message_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,
  media_type  TEXT NOT NULL,
  filename    TEXT NOT NULL,
  byte_size   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
  ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_user_id
  ON message_attachments(user_id);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_owns_message_attachments" ON message_attachments;
CREATE POLICY "user_owns_message_attachments" ON message_attachments
  FOR ALL USING (
    user_id = auth.uid()
    AND message_id IN (
      SELECT m.id
      FROM messages m
      JOIN chat_sessions s ON s.id = m.session_id
      WHERE s.user_id = auth.uid()
    )
  );
