-- =============================================================
-- Note Everything / Second Brain — Schema V2.0
-- Fresh database: paste into Supabase SQL Editor → Run once.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------
-- Documents & chunks
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename           TEXT NOT NULL,
  file_type          TEXT NOT NULL,
  r2_key             TEXT NOT NULL,
  file_size_bytes    BIGINT NOT NULL DEFAULT 0,
  chunk_count        INTEGER DEFAULT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error_message      TEXT,
  note_content       TEXT,
  description        TEXT,
  content_hash       TEXT,
  ocr_text           TEXT,
  extracted_content  TEXT,
  folder_id          UUID,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_content_hash ON documents(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  chunk_text       TEXT NOT NULL,
  chunk_index      INTEGER NOT NULL,
  qdrant_point_id  UUID NOT NULL,
  page             INTEGER,
  search_vector    tsvector,
  search_vector_norm tsvector,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_search_vector ON document_chunks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_chunks_search_vector_norm ON document_chunks USING gin(search_vector_norm);

-- ---------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------

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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

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

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_user_id ON message_attachments(user_id);

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
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_actions_session_id ON chat_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_actions_user_status ON chat_actions(user_id, status);

-- ---------------------------------------------------------------
-- Profiles, folders, tags
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

CREATE TABLE IF NOT EXISTS folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#f59e0b',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_folder_id_fkey;
ALTER TABLE documents
  ADD CONSTRAINT documents_folder_id_fkey
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag_id ON document_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_user_id ON document_tags(user_id);

-- ---------------------------------------------------------------
-- Usage & email verification
-- ---------------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_purpose ON usage_logs(user_id, purpose);

CREATE TABLE IF NOT EXISTS email_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at);

-- ---------------------------------------------------------------
-- Full-text search helpers
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION normalize_vi_search_text(input TEXT)
RETURNS TEXT AS $$
  SELECT lower(unaccent(trim(COALESCE(input, ''))));
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION document_chunks_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.chunk_text, ''));
  NEW.search_vector_norm := to_tsvector('simple', normalize_vi_search_text(NEW.chunk_text));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_chunks_search_vector ON document_chunks;
CREATE TRIGGER trg_document_chunks_search_vector
  BEFORE INSERT OR UPDATE OF chunk_text ON document_chunks
  FOR EACH ROW EXECUTE FUNCTION document_chunks_search_vector_update();

CREATE OR REPLACE FUNCTION search_document_chunks(
  p_user_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  document_id UUID,
  chunk_index INT,
  chunk_text TEXT,
  filename TEXT,
  rank REAL
) AS $$
DECLARE
  tsq_original tsquery;
  tsq_normalized tsquery;
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF trim(COALESCE(p_query, '')) = '' THEN
    RETURN;
  END IF;

  tsq_original := plainto_tsquery('simple', trim(p_query));
  tsq_normalized := plainto_tsquery('simple', normalize_vi_search_text(p_query));

  RETURN QUERY
  SELECT
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    d.filename,
    GREATEST(
      ts_rank(dc.search_vector, tsq_original),
      ts_rank(dc.search_vector_norm, tsq_normalized)
    ) AS rank
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = p_user_id
    AND (
      dc.search_vector @@ tsq_original
      OR dc.search_vector_norm @@ tsq_normalized
    )
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION search_document_chunks_internal(
  p_user_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  document_id UUID,
  chunk_index INT,
  chunk_text TEXT,
  filename TEXT,
  rank REAL
) AS $$
DECLARE
  tsq_original tsquery;
  tsq_normalized tsquery;
BEGIN
  IF trim(COALESCE(p_query, '')) = '' THEN
    RETURN;
  END IF;

  tsq_original := plainto_tsquery('simple', trim(p_query));
  tsq_normalized := plainto_tsquery('simple', normalize_vi_search_text(p_query));

  RETURN QUERY
  SELECT
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    d.filename,
    GREATEST(
      ts_rank(dc.search_vector, tsq_original),
      ts_rank(dc.search_vector_norm, tsq_normalized)
    ) AS rank
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = p_user_id
    AND (
      dc.search_vector @@ tsq_original
      OR dc.search_vector_norm @@ tsq_normalized
    )
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION search_document_chunks_internal(UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION search_document_chunks_internal(UUID, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION search_document_chunks_internal(UUID, TEXT, INT) FROM authenticated;

-- ---------------------------------------------------------------
-- Profiles: admin helper + auto-create on signup
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_documents" ON documents;
CREATE POLICY "user_owns_documents" ON documents
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_chunks" ON document_chunks;
CREATE POLICY "user_owns_chunks" ON document_chunks
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_sessions" ON chat_sessions;
CREATE POLICY "user_owns_sessions" ON chat_sessions
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_messages" ON messages;
CREATE POLICY "user_owns_messages" ON messages
  FOR ALL USING (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
  );

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

ALTER TABLE chat_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_chat_actions" ON chat_actions;
CREATE POLICY "user_owns_chat_actions" ON chat_actions
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
CREATE POLICY "admins_read_all_profiles" ON profiles
  FOR SELECT USING (public.is_admin());

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_folders" ON folders;
CREATE POLICY "user_owns_folders" ON folders
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_tags" ON tags;
CREATE POLICY "user_owns_tags" ON tags
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_document_tags" ON document_tags;
CREATE POLICY "user_owns_document_tags" ON document_tags
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_selects_own_usage_logs" ON usage_logs;
CREATE POLICY "user_selects_own_usage_logs" ON usage_logs
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "user_inserts_own_usage_logs" ON usage_logs;
CREATE POLICY "user_inserts_own_usage_logs" ON usage_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
-- Service-role only (no user policies).
