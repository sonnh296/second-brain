-- Fix tenant isolation: enforce caller can only search their own chunks
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
