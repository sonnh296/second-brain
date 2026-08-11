-- Stage replacement uploads without changing the active document object.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS replacement_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS replacement_filename TEXT,
  ADD COLUMN IF NOT EXISTS replacement_file_type TEXT,
  ADD COLUMN IF NOT EXISTS replacement_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS replacement_started_at TIMESTAMPTZ;
