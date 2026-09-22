-- Soft-delete / trash for classroom lessons and assignments.
-- classroom_documents already has deleted_at; keep R2 until permanent purge.

ALTER TABLE classroom_lessons
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_classroom_lessons_active
  ON classroom_lessons (classroom_id, lesson_index DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_classroom_lessons_trash
  ON classroom_lessons (classroom_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_active
  ON assignments (classroom_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_classroom_documents_trash
  ON classroom_documents (classroom_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- Members only see active lessons; teachers (FOR ALL) can still read trash.
DROP POLICY IF EXISTS "members_select_lessons" ON classroom_lessons;
CREATE POLICY "members_select_lessons" ON classroom_lessons
  FOR SELECT USING (
    public.is_classroom_member(classroom_id) AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "members_select_assignments" ON assignments;
CREATE POLICY "members_select_assignments" ON assignments
  FOR SELECT USING (
    public.is_classroom_member(classroom_id) AND deleted_at IS NULL
  );
