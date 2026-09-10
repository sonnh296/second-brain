-- Rich assignment body (markdown), inline student answers, Google Docs-style comments

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS content_md TEXT NOT NULL DEFAULT '';

-- Allow draft submissions without files (text-first workflow)
ALTER TABLE assignment_submissions
  ALTER COLUMN status SET DEFAULT 'draft';

CREATE TABLE IF NOT EXISTS assignment_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  submission_id   UUID REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_text      TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_comments_assignment
  ON assignment_comments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_comments_submission
  ON assignment_comments(submission_id);

ALTER TABLE assignment_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignment_comments_select ON assignment_comments;
CREATE POLICY assignment_comments_select ON assignment_comments
  FOR SELECT USING (
    is_classroom_member((SELECT classroom_id FROM assignments WHERE id = assignment_id))
  );

DROP POLICY IF EXISTS assignment_comments_insert ON assignment_comments;
CREATE POLICY assignment_comments_insert ON assignment_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND is_classroom_member((SELECT classroom_id FROM assignments WHERE id = assignment_id))
  );

DROP POLICY IF EXISTS assignment_comments_update ON assignment_comments;
CREATE POLICY assignment_comments_update ON assignment_comments
  FOR UPDATE USING (
    author_id = auth.uid()
    OR is_classroom_teacher((SELECT classroom_id FROM assignments WHERE id = assignment_id))
  );

DROP POLICY IF EXISTS assignment_comments_delete ON assignment_comments;
CREATE POLICY assignment_comments_delete ON assignment_comments
  FOR DELETE USING (
    author_id = auth.uid()
    OR is_classroom_teacher((SELECT classroom_id FROM assignments WHERE id = assignment_id))
  );
