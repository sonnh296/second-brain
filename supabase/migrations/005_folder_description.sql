-- Optional folder description for library + chat search (not embedded into RAG).
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS description TEXT;
