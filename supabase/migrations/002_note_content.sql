-- Add inline note support to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS note_content TEXT;
