-- =============================================================
-- Note Everything 2.2 — document favorites
-- =============================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_documents_user_favorite
  ON documents(user_id, is_favorite)
  WHERE is_favorite = true AND deleted_at IS NULL;
