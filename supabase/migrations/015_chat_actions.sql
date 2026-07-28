-- =============================================================
-- Chat-driven note operations: soft delete + action audit/confirm
-- =============================================================

-- Soft delete for documents (chat delete = move to trash, not hard delete)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at) WHERE deleted_at IS NOT NULL;

-- Actions proposed/executed via chat (audit log + pending confirmations)
CREATE TABLE IF NOT EXISTS chat_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL CHECK (action_type IN ('create_note', 'update_note', 'delete_note', 'restore_note')),
  document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_actions_session_id ON chat_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_actions_user_status ON chat_actions(user_id, status);

ALTER TABLE chat_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_chat_actions" ON chat_actions;
CREATE POLICY "user_owns_chat_actions" ON chat_actions
  FOR ALL USING (user_id = auth.uid());
