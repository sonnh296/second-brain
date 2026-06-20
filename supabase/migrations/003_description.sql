-- Short description for documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
