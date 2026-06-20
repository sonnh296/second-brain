-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at DESC);

-- Full-text search on document chunks (hybrid retrieval)
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION document_chunks_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.chunk_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_chunks_search_vector ON document_chunks;
CREATE TRIGGER trg_document_chunks_search_vector
  BEFORE INSERT OR UPDATE OF chunk_text ON document_chunks
  FOR EACH ROW EXECUTE FUNCTION document_chunks_search_vector_update();

-- Backfill existing rows
UPDATE document_chunks
SET search_vector = to_tsvector('simple', COALESCE(chunk_text, ''))
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_search_vector ON document_chunks USING gin(search_vector);

-- RPC for keyword search scoped to user
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
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    d.filename,
    ts_rank(dc.search_vector, to_tsquery('simple', p_query)) AS rank
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = p_user_id
    AND dc.search_vector @@ to_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Content hash for deduplication (Phase 3)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_user_content_hash ON documents(user_id, content_hash);
