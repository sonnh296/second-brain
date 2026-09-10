-- Allow multiple assignments per lesson
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_lesson_id_key;

-- Keep lookups fast without uniqueness
CREATE INDEX IF NOT EXISTS idx_assignments_lesson ON assignments(lesson_id);
