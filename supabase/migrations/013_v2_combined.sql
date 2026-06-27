-- =============================================================
-- Second Brain v2 — Combined migration (chạy 1 lần trên Supabase)
-- Gồm: Tags, OCR, Folders, Extracted content
-- Yêu cầu: đã chạy 001–007 (schema gốc)
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tags (many-to-many với documents)
-- -------------------------------------------------------------

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

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_tags" ON tags;
CREATE POLICY "user_owns_tags" ON tags
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_document_tags" ON document_tags;
CREATE POLICY "user_owns_document_tags" ON document_tags
  FOR ALL USING (user_id = auth.uid());

-- -------------------------------------------------------------
-- 2. OCR text (ảnh — Google Vision)
-- -------------------------------------------------------------

ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_text TEXT;

-- -------------------------------------------------------------
-- 3. Folders (Google Drive style)
-- -------------------------------------------------------------

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

ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_folders" ON folders;
CREATE POLICY "user_owns_folders" ON folders
  FOR ALL USING (user_id = auth.uid());

-- -------------------------------------------------------------
-- 4. Extracted content (OCR + PDF/DOCX parse + notes)
-- -------------------------------------------------------------

ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_content TEXT;

UPDATE documents
SET extracted_content = ocr_text
WHERE extracted_content IS NULL AND ocr_text IS NOT NULL;
