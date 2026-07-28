-- =============================================================
-- Pending migrations 014–017 (chạy 1 lần trên Supabase SQL Editor)
-- Nguyên nhân list documents 500: thiếu cột deleted_at
-- =============================================================

-- 014: message attachments
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

-- 015: soft delete + chat_actions
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL CHECK (action_type IN (
    'create_note', 'update_note', 'delete_note', 'restore_note',
    'rename_document', 'move_document', 'tag_document'
  )),
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

-- 016: extend action types (idempotent if already created with full list above)
ALTER TABLE chat_actions DROP CONSTRAINT IF EXISTS chat_actions_action_type_check;
ALTER TABLE chat_actions ADD CONSTRAINT chat_actions_action_type_check
  CHECK (action_type IN (
    'create_note', 'update_note', 'delete_note', 'restore_note',
    'rename_document', 'move_document', 'tag_document'
  ));

-- 017: PDF page metadata on chunks
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page INTEGER;
