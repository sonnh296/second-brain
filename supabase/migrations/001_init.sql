-- =============================================================
-- Second Brain — Initial Migration
-- Run this in your Supabase SQL Editor (or via supabase db push)
-- =============================================================

-- users: provided by Supabase Auth (auth.users) — no custom table needed

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  file_type       TEXT NOT NULL,
  r2_key          TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  chunk_count     INTEGER DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  chunk_text      TEXT NOT NULL,
  chunk_index     INTEGER NOT NULL,
  qdrant_point_id UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Source of truth for backup/re-index and Postgres full-text keyword search
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON document_chunks(user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  cited_sources JSONB DEFAULT '[]',
  -- cited_sources: [{ filename: string, chunk_index: number }]
  -- populated from Qdrant payload after retrieval — no Postgres join needed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

-- ---------------------------------------------------------------
-- Row Level Security — defense-in-depth (data isolation at DB level)
-- Prevents data leaks even if application layer has a bug
-- ---------------------------------------------------------------

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_documents" ON documents
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_chunks" ON document_chunks
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_sessions" ON chat_sessions
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_messages" ON messages
  FOR ALL USING (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
  );
