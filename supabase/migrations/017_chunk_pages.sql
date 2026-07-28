-- =============================================================
-- Page numbers on chunks — enables page-accurate PDF citations
-- =============================================================

ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page INTEGER;
