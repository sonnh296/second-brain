-- Lesson-scoped quiz/review sets
ALTER TABLE review_sets
  ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES classroom_lessons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_review_sets_lesson
  ON review_sets(lesson_id)
  WHERE lesson_id IS NOT NULL;
