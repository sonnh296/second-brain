-- Vietnamese-friendly full-text search: unaccent normalization + dual tsvector index

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION normalize_vi_search_text(input TEXT)
RETURNS TEXT AS $$
  SELECT lower(unaccent(trim(COALESCE(input, ''))));
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector_norm tsvector;

CREATE OR REPLACE FUNCTION document_chunks_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.chunk_text, ''));
  NEW.search_vector_norm := to_tsvector('simple', normalize_vi_search_text(NEW.chunk_text));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill normalized vectors for existing rows
UPDATE document_chunks
SET chunk_text = chunk_text
WHERE search_vector_norm IS NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_search_vector_norm
  ON document_chunks USING gin(search_vector_norm);

-- Keyword search: match original text OR accent-insensitive normalized text
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

-- Service-role only: used by eval/cleanup scripts (no session context)
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
